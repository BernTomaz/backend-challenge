import { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { hashBusinessPayload } from "../../application/payload-hash";
import { MoneyProps } from "../../domain/money";
import { WagerTransactionKind } from "../../domain/wager-transaction";
import { InboxMessageRecord } from "../database/entities/inbox-message.record";
import {
  processHttpWagerTransaction,
  ProcessHttpWagerTransactionResult,
} from "../database/process-http-wager-transaction";

export const WAGER_TRANSACTION_CONSUMER = "wager-transaction-consumer";

export interface WagerTransactionRequestedMessage {
  messageId: string;
  type: "WagerTransactionRequested";
  occurredAt: string;
  data: {
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: MoneyProps;
    referenceExternalTransactionId?: string;
  };
}

export interface ProcessWagerTransactionMessageResult {
  result?: ProcessHttpWagerTransactionResult;
  duplicate: boolean;
}

export class InvalidSqsMessageError extends Error {}
export class InboxPayloadConflictError extends Error {}

export async function processWagerTransactionMessage(
  em: EntityManager,
  message: WagerTransactionRequestedMessage,
): Promise<ProcessWagerTransactionMessageResult> {
  assertValidMessage(message);

  return em.transactional(async (tx) => {
    const payloadHash = hashBusinessPayload(message as unknown as Record<string, unknown>);
    const existing = await tx.findOne(InboxMessageRecord, {
      consumerName: WAGER_TRANSACTION_CONSUMER,
      messageId: message.messageId,
    });

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new InboxPayloadConflictError("Inbox message already received with different payload");
      }

      if (existing.processedAt) {
        return { duplicate: true };
      }
    }

    const inbox = existing ?? Object.assign(new InboxMessageRecord(), {
      id: randomUUID(),
      messageId: message.messageId,
      consumerName: WAGER_TRANSACTION_CONSUMER,
      payloadHash,
      receivedAt: new Date(message.occurredAt),
    });
    tx.persist(inbox);
    await tx.flush();

    const result = await processHttpWagerTransaction(tx, {
      ...message.data,
      payloadHash: hashBusinessPayload(message.data as unknown as Record<string, unknown>),
    });
    inbox.processedAt = new Date();

    return { result, duplicate: false };
  });
}

function assertValidMessage(message: WagerTransactionRequestedMessage): void {
  if (!message || message.type !== "WagerTransactionRequested") {
    throw new InvalidSqsMessageError("Invalid message type");
  }

  if (!message.messageId || Number.isNaN(Date.parse(message.occurredAt))) {
    throw new InvalidSqsMessageError("Invalid message envelope");
  }

  if (!message.data?.idempotencyKey) {
    throw new InvalidSqsMessageError("Missing idempotency key");
  }

  if (!Object.values(WagerTransactionKind).includes(message.data.kind)) {
    throw new InvalidSqsMessageError("Invalid transaction kind");
  }

  if (message.data.kind === WagerTransactionKind.Opening) {
    throw new InvalidSqsMessageError("OPENING cannot be submitted");
  }
}
