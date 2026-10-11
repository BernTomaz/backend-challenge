import { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { Money } from "../../domain/money";
import { WagerTransaction, WagerTransactionStatus } from "../../domain/wager-transaction";
import { WagerTransactionRecord } from "./entities/wager-transaction.record";
import { processPersistedWagerTransaction } from "./process-persisted-wager-transaction";

export interface ReprocessPendingReferencesInput {
  em: EntityManager;
  now?: Date;
  limit?: number;
}

export interface ReprocessPendingReferencesResult {
  processed: number;
}

export async function reprocessPendingReferences(
  input: ReprocessPendingReferencesInput,
): Promise<ReprocessPendingReferencesResult> {
  const now = input.now ?? new Date();
  const records = await input.em.find(
    WagerTransactionRecord,
    {
      status: WagerTransactionStatus.PendingReference,
      $or: [
        { nextReferenceLookupAt: null },
        { nextReferenceLookupAt: { $lte: now } },
      ],
    },
    {
      limit: input.limit ?? 50,
      orderBy: { createdAt: "asc" },
    },
  );

  for (const record of records) {
    await processPersistedWagerTransaction({
      em: input.em.fork(),
      transaction: toDomainTransaction(record),
      ledgerEntryId: randomUUID(),
      processedAt: now,
      correlationId: record.id,
    });
  }

  return { processed: records.length };
}

function toDomainTransaction(record: WagerTransactionRecord): WagerTransaction {
  return WagerTransaction.rehydrate({
    id: record.id,
    providerId: record.providerId,
    externalTransactionId: record.externalTransactionId,
    idempotencyKey: record.idempotencyKey,
    payloadHash: record.payloadHash,
    walletId: record.walletId,
    playerId: record.playerId,
    roundId: record.roundId,
    gameId: record.gameId,
    kind: record.kind,
    money: Money.from({ amount: record.amount, currency: record.currency }),
    referenceExternalTransactionId: record.referenceExternalTransactionId,
    createdAt: record.createdAt,
    status: record.status,
    referenceTransactionId: record.referenceTransactionId,
    failureCode: record.failureCode,
    processedAt: record.processedAt,
  });
}
