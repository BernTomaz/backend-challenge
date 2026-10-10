import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { MikroORM } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { WagerTransactionKind } from "../../../src/domain/wager-transaction";
import { InboxMessageRecord } from "../../../src/infrastructure/database/entities/inbox-message.record";
import { WalletLedgerEntryRecord } from "../../../src/infrastructure/database/entities/wallet-ledger-entry.record";
import { WagerTransactionRecord } from "../../../src/infrastructure/database/entities/wager-transaction.record";
import { WalletRecord } from "../../../src/infrastructure/database/entities/wallet.record";
import config from "../../../src/infrastructure/database/mikro-orm.config";
import { SqsWagerTransactionConsumer } from "../../../src/infrastructure/sqs/sqs-wager-transaction-consumer";
import { WagerTransactionRequestedMessage } from "../../../src/infrastructure/sqs/process-wager-transaction-message";

let orm: MikroORM;
let sqs: SQSClient;
let queueUrl: string;
let dlqUrl: string;

describe("SqsWagerTransactionConsumer integration", () => {
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
    queueUrl = await createQueue(`wager-transactions-${randomUUID()}.fifo`);
    dlqUrl = await createQueue(`wager-transactions-dlq-${randomUUID()}.fifo`);
  });

  afterAll(async () => {
    await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: dlqUrl }));
    await orm.getMigrator().down();
    await orm.close(true);
  });

  test("processes SQS message and deletes it after commit", async () => {
    const walletId = randomUUID();
    const playerId = randomUUID();
    await persistWallet(walletId, playerId, "100.00");
    const message = wagerMessage({
      messageId: `msg-${randomUUID()}`,
      walletId,
      playerId,
      externalTransactionId: `transaction-${randomUUID()}`,
    });
    await send(message);

    const action = await consumer().pollOnce();
    const em = orm.em.fork();
    const wallet = await em.findOneOrFail(WalletRecord, { id: walletId });
    const transactions = await em.find(WagerTransactionRecord, { walletId });
    const ledgerEntries = await em.find(WalletLedgerEntryRecord, { walletId });
    const inboxMessages = await em.find(InboxMessageRecord, { messageId: message.messageId });
    const queueMessages = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1,
    }));

    expect(action).toBe("processed");
    expect(wallet.balanceAmount).toBe("75.00");
    expect(transactions).toHaveLength(1);
    expect(ledgerEntries).toHaveLength(1);
    expect(inboxMessages).toHaveLength(1);
    expect(inboxMessages[0]?.processedAt).toBeInstanceOf(Date);
    expect(queueMessages.Messages ?? []).toHaveLength(0);
  });

  test("redelivery does not duplicate financial effects", async () => {
    const walletId = randomUUID();
    const playerId = randomUUID();
    await persistWallet(walletId, playerId, "100.00");
    const message = wagerMessage({
      messageId: `msg-${randomUUID()}`,
      walletId,
      playerId,
      externalTransactionId: `transaction-${randomUUID()}`,
    });

    await send(message);
    await consumer().pollOnce();
    await send(message);
    await consumer().pollOnce();

    const em = orm.em.fork();
    const wallet = await em.findOneOrFail(WalletRecord, { id: walletId });
    const transactions = await em.find(WagerTransactionRecord, { walletId });
    const ledgerEntries = await em.find(WalletLedgerEntryRecord, { walletId });
    const inboxMessages = await em.find(InboxMessageRecord, { messageId: message.messageId });

    expect(wallet.balanceAmount).toBe("75.00");
    expect(transactions).toHaveLength(1);
    expect(ledgerEntries).toHaveLength(1);
    expect(inboxMessages).toHaveLength(1);
  });

  test("moves transient failure to DLQ after attempt limit", async () => {
    const message = wagerMessage({
      messageId: `msg-${randomUUID()}`,
      walletId: randomUUID(),
      playerId: randomUUID(),
      externalTransactionId: `transaction-${randomUUID()}`,
    });
    await send(message);

    const action = await consumer({ maxAttempts: 1 }).pollOnce();
    const dlqMessages = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: dlqUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1,
    }));
    const queueMessages = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1,
    }));

    expect(action).toBe("dlq");
    expect(dlqMessages.Messages).toHaveLength(1);
    expect(dlqMessages.Messages?.[0]?.Body).toBe(JSON.stringify(message));
    expect(queueMessages.Messages ?? []).toHaveLength(0);
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

function consumer(props: { maxAttempts?: number } = {}): SqsWagerTransactionConsumer {
  return new SqsWagerTransactionConsumer(sqs, orm.em.fork(), {
    queueUrl,
    dlqUrl,
    maxAttempts: props.maxAttempts ?? 5,
    retryVisibilityTimeoutSeconds: 1,
  });
}

async function send(message: WagerTransactionRequestedMessage): Promise<void> {
  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
    MessageGroupId: message.data.walletId,
    MessageDeduplicationId: randomUUID(),
  }));
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

function wagerMessage(props: {
  messageId: string;
  walletId: string;
  playerId: string;
  externalTransactionId: string;
}): WagerTransactionRequestedMessage {
  return {
    messageId: props.messageId,
    type: "WagerTransactionRequested",
    occurredAt: "2026-07-29T15:00:00.000Z",
    data: {
      providerId: "provider-a",
      externalTransactionId: props.externalTransactionId,
      idempotencyKey: `provider-a:${props.externalTransactionId}`,
      playerId: props.playerId,
      walletId: props.walletId,
      roundId: "round-987",
      gameId: "fortune-chimp",
      kind: WagerTransactionKind.Bet,
      money: { amount: "25.00", currency: "BRL" },
    },
  };
}
