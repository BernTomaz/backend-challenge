import { describe, expect, test } from "bun:test";
import { Message } from "@aws-sdk/client-sqs";
import { EntityManager } from "@mikro-orm/postgresql";
import { hashBusinessPayload } from "../../../src/application/payload-hash";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../../src/domain/wager-transaction";
import { InboxMessageRecord } from "../../../src/infrastructure/database/entities/inbox-message.record";
import { WagerTransactionRecord } from "../../../src/infrastructure/database/entities/wager-transaction.record";
import {
  SqsWagerTransactionConsumer,
} from "../../../src/infrastructure/sqs/sqs-wager-transaction-consumer";
import { WagerTransactionRequestedMessage } from "../../../src/infrastructure/sqs/process-wager-transaction-message";

describe("SqsWagerTransactionConsumer", () => {
  test("deletes message only after successful processing", async () => {
    const sent = await runConsumer(message());

    expect(sent).toContain("ReceiveMessageCommand");
    expect(sent).toContain("DeleteMessageCommand");
    expect(sent).not.toContain("ChangeMessageVisibilityCommand");
    expect(sent).not.toContain("SendMessageCommand");
  });

  test("deletes permanent invalid message", async () => {
    const sent = await runConsumer({ Body: "{", ReceiptHandle: "receipt-1" }, failingEm());

    expect(sent).toEqual(["ReceiveMessageCommand", "DeleteMessageCommand"]);
  });

  test("defers transient error before max attempts", async () => {
    const sent = await runConsumer(message({ receiveCount: 2 }), failingEm());

    expect(sent).toEqual(["ReceiveMessageCommand", "ChangeMessageVisibilityCommand"]);
  });

  test("moves transient error to DLQ after max attempts", async () => {
    const sent = await runConsumer(message({ receiveCount: 5 }), failingEm());

    expect(sent).toEqual(["ReceiveMessageCommand", "SendMessageCommand", "DeleteMessageCommand"]);
  });

  test("does not start a new poll after stop", async () => {
    const sent: string[] = [];
    const consumer = new SqsWagerTransactionConsumer({
      send: async (command: { constructor: { name: string } }) => {
        sent.push(command.constructor.name);
        return { Messages: [] };
      },
    }, failingEm(), {
      queueUrl: "queue-url",
      dlqUrl: "dlq-url",
    });

    consumer.stop();
    await consumer.run();

    expect(sent).toEqual([]);
  });
});

async function runConsumer(
  sqsMessage: Message,
  em: EntityManager = successfulEm(JSON.parse(sqsMessage.Body ?? "{}")),
): Promise<string[]> {
  const sent: string[] = [];
  const sqs = {
    send: async (command: { constructor: { name: string } }) => {
      sent.push(command.constructor.name);

      if (command.constructor.name === "ReceiveMessageCommand") {
        return { Messages: [sqsMessage] };
      }

      return {};
    },
  };
  const consumer = new SqsWagerTransactionConsumer(sqs, em, {
    queueUrl: "queue-url",
    dlqUrl: "dlq-url",
    maxAttempts: 5,
  });

  await consumer.pollOnce();

  return sent;
}

function successfulEm(messageBody: WagerTransactionRequestedMessage): EntityManager {
  let inbox: InboxMessageRecord | undefined;

  return {
    transactional: async (work: (tx: EntityManager) => unknown) => work({
      findOne: async (entity: unknown) => {
        if (entity === InboxMessageRecord) {
          return inbox;
        }

        if (entity === WagerTransactionRecord) {
          return Object.assign(new WagerTransactionRecord(), {
            id: "transaction-1",
            payloadHash: hashBusinessPayload(messageBody.data as unknown as Record<string, unknown>),
            status: WagerTransactionStatus.Processed,
            observedBalanceAmount: "75.00",
            observedBalanceCurrency: "BRL",
          });
        }
      },
      persist: (record: InboxMessageRecord) => {
        inbox = record;
      },
      flush: async () => undefined,
    } as unknown as EntityManager),
  } as unknown as EntityManager;
}

function failingEm(): EntityManager {
  return {
    transactional: async () => {
      throw new Error("database unavailable");
    },
  } as unknown as EntityManager;
}

function message(props: { receiveCount?: number } = {}): Message {
  return {
    Body: JSON.stringify({
      messageId: "msg-123",
      type: "WagerTransactionRequested",
      occurredAt: "2026-07-29T15:00:00.000Z",
      data: {
        providerId: "provider-a",
        externalTransactionId: "transaction-123",
        idempotencyKey: "provider-a:transaction-123",
        playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
        walletId: "0192f291-27dd-7d3f-8071-5f8685deef37",
        roundId: "round-987",
        gameId: "fortune-chimp",
        kind: WagerTransactionKind.Bet,
        money: { amount: "25.00", currency: "BRL" },
      },
    } satisfies WagerTransactionRequestedMessage),
    ReceiptHandle: "receipt-1",
    Attributes: {
      ApproximateReceiveCount: String(props.receiveCount ?? 1),
    },
  };
}
