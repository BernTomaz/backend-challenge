import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { MikroORM } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { Money } from "../../../src/domain/money";
import { WagerTransaction, WagerTransactionKind } from "../../../src/domain/wager-transaction";
import config from "../../../src/infrastructure/database/mikro-orm.config";
import { OutboxMessageRecord } from "../../../src/infrastructure/database/entities/outbox-message.record";
import { WalletRecord } from "../../../src/infrastructure/database/entities/wallet.record";
import { processPersistedWagerTransaction } from "../../../src/infrastructure/database/process-persisted-wager-transaction";
import { publishDueOutboxMessages } from "../../../src/infrastructure/database/publish-outbox-messages";
import { SqsOutboxPublisher } from "../../../src/infrastructure/sqs/sqs-outbox-publisher";

let orm: MikroORM;
let sqs: SQSClient;
let queueUrl: string;

describe("SqsOutboxPublisher integration", () => {
  beforeAll(async () => {
    orm = await MikroORM.init(config);
    await orm.getMigrator().up();
    sqs = new SQSClient({
      region: process.env.AWS_REGION ?? "us-east-1",
      endpoint: process.env.SQS_ENDPOINT ?? "http://localhost:4566",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
      },
    });
    queueUrl = await createQueue(`integration-events-${randomUUID()}.fifo`);
  });

  afterAll(async () => {
    await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
    await orm.getMigrator().down();
    await orm.close(true);
  });

  test("publishes committed outbox event after financial transaction", async () => {
    const walletId = randomUUID();
    const playerId = randomUUID();
    const transactionId = randomUUID();
    await persistWallet(walletId, playerId, "100.00");

    await processPersistedWagerTransaction({
      em: orm.em.fork(),
      transaction: WagerTransaction.create({
        id: transactionId,
        providerId: "provider-a",
        externalTransactionId: `transaction-${randomUUID()}`,
        idempotencyKey: `provider-a:${transactionId}`,
        payloadHash: "a".repeat(64),
        walletId,
        playerId,
        roundId: "round-1",
        gameId: "game-1",
        kind: WagerTransactionKind.Bet,
        money: Money.from({ amount: "25.00", currency: "BRL" }),
      }),
      ledgerEntryId: randomUUID(),
      correlationId: `provider-a:${transactionId}`,
    });

    const pending = await orm.em.fork().find(OutboxMessageRecord, {
      aggregateId: walletId,
      publishedAt: null,
    });

    expect(pending.map((message) => message.eventType).sort()).toEqual([
      "WagerTransactionProcessed",
      "WalletBalanceChanged",
    ]);

    const published = await publishDueOutboxMessages({
      em: orm.em.fork(),
      publisher: new SqsOutboxPublisher(sqs, queueUrl),
    });
    const sqsMessages = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 1,
    }));
    const stored = await orm.em.fork().find(OutboxMessageRecord, { aggregateId: walletId });

    expect(published).toBe(2);
    expect(sqsMessages.Messages).toHaveLength(2);
    expect(stored.every((message) => message.publishedAt)).toBe(true);
  });
});

async function createQueue(queueName: string): Promise<string> {
  const response = await sqs.send(new CreateQueueCommand({
    QueueName: queueName,
    Attributes: { FifoQueue: "true" },
  }));

  if (!response.QueueUrl) {
    throw new Error(`Queue not created: ${queueName}`);
  }

  return response.QueueUrl;
}

async function persistWallet(
  walletId: string,
  playerId: string,
  balanceAmount: string,
): Promise<void> {
  const now = new Date("2026-01-01T00:00:00.000Z");
  await orm.em.fork().persistAndFlush(Object.assign(new WalletRecord(), {
    id: walletId,
    playerId,
    currency: "BRL",
    balanceAmount,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));
}
