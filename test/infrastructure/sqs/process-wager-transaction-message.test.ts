import { describe, expect, test } from "bun:test";
import { EntityManager } from "@mikro-orm/postgresql";
import { hashBusinessPayload } from "../../../src/application/payload-hash";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../../src/domain/wager-transaction";
import { InboxMessageRecord } from "../../../src/infrastructure/database/entities/inbox-message.record";
import { WagerTransactionRecord } from "../../../src/infrastructure/database/entities/wager-transaction.record";
import {
  InboxPayloadConflictError,
  InvalidSqsMessageError,
  processWagerTransactionMessage,
  WAGER_TRANSACTION_CONSUMER,
  WagerTransactionRequestedMessage,
} from "../../../src/infrastructure/sqs/process-wager-transaction-message";

describe("processWagerTransactionMessage", () => {
  test("stores inbox message and reuses persisted transaction processing", async () => {
    const message = wagerMessage();
    let inbox: InboxMessageRecord | undefined;
    const em = {
      transactional: async (work: (tx: EntityManager) => unknown) => work({
        findOne: async (entity: unknown) => {
          if (entity === InboxMessageRecord) {
            return inbox;
          }

          if (entity === WagerTransactionRecord) {
            return Object.assign(new WagerTransactionRecord(), {
              id: "transaction-1",
              payloadHash: hashBusinessPayload(message.data as unknown as Record<string, unknown>),
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

    const result = await processWagerTransactionMessage(em, message);

    expect(result).toEqual({
      duplicate: false,
      result: {
        transactionId: "transaction-1",
        status: WagerTransactionStatus.Processed,
        balance: { amount: "75.00", currency: "BRL" },
        idempotentReplay: true,
      },
    });
    expect(inbox?.consumerName).toBe(WAGER_TRANSACTION_CONSUMER);
    expect(inbox?.messageId).toBe(message.messageId);
    expect(inbox?.processedAt).toBeInstanceOf(Date);
  });

  test("acknowledges already processed redelivery without duplicating work", async () => {
    const message = wagerMessage();
    const em = {
      transactional: async (work: (tx: EntityManager) => unknown) => work({
        findOne: async () => Object.assign(new InboxMessageRecord(), {
          messageId: message.messageId,
          consumerName: WAGER_TRANSACTION_CONSUMER,
          payloadHash: hashBusinessPayload(message as unknown as Record<string, unknown>),
          processedAt: new Date("2026-01-01T00:00:01.000Z"),
        }),
      } as unknown as EntityManager),
    } as unknown as EntityManager;

    await expect(processWagerTransactionMessage(em, message)).resolves.toEqual({
      duplicate: true,
    });
  });

  test("rejects same inbox key with different payload", async () => {
    const message = wagerMessage();
    const em = {
      transactional: async (work: (tx: EntityManager) => unknown) => work({
        findOne: async () => Object.assign(new InboxMessageRecord(), {
          messageId: message.messageId,
          consumerName: WAGER_TRANSACTION_CONSUMER,
          payloadHash: "0".repeat(64),
        }),
      } as unknown as EntityManager),
    } as unknown as EntityManager;

    await expect(processWagerTransactionMessage(em, message)).rejects.toThrow(
      InboxPayloadConflictError,
    );
  });

  test("rejects OPENING from queue", async () => {
    await expect(
      processWagerTransactionMessage({} as EntityManager, {
        ...wagerMessage(),
        data: { ...wagerMessage().data, kind: WagerTransactionKind.Opening },
      }),
    ).rejects.toThrow(InvalidSqsMessageError);
  });
});

function wagerMessage(): WagerTransactionRequestedMessage {
  return {
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
  };
}
