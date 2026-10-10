import { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { Money, MoneyProps } from "../../domain/money";
import {
  WagerTransaction,
  WagerTransactionKind,
} from "../../domain/wager-transaction";
import { WagerTransactionRecord } from "./entities/wager-transaction.record";
import { processPersistedWagerTransaction } from "./process-persisted-wager-transaction";

export interface ProcessHttpWagerTransactionInput {
  idempotencyKey: string;
  payloadHash: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
}

export interface ProcessHttpWagerTransactionResult {
  transactionId: string;
  status: string;
  balance?: MoneyProps;
  idempotentReplay: boolean;
}

export class IdempotencyConflictError extends Error {}

export async function processHttpWagerTransaction(
  em: EntityManager,
  input: ProcessHttpWagerTransactionInput,
): Promise<ProcessHttpWagerTransactionResult> {
  const existing = await em.findOne(WagerTransactionRecord, {
    idempotencyKey: input.idempotencyKey,
  });

  if (existing) {
    if (existing.payloadHash !== input.payloadHash) {
      throw new IdempotencyConflictError("Idempotency key already used with different payload");
    }

    return {
      transactionId: existing.id,
      status: existing.status,
      balance: existing.observedBalanceAmount && existing.observedBalanceCurrency
        ? {
            amount: existing.observedBalanceAmount,
            currency: existing.observedBalanceCurrency,
          }
        : undefined,
      idempotentReplay: true,
    };
  }

  const transaction = WagerTransaction.create({
    id: randomUUID(),
    providerId: input.providerId,
    externalTransactionId: input.externalTransactionId,
    idempotencyKey: input.idempotencyKey,
    payloadHash: input.payloadHash,
    walletId: input.walletId,
    playerId: input.playerId,
    roundId: input.roundId,
    gameId: input.gameId,
    kind: input.kind,
    money: Money.from(input.money),
    referenceExternalTransactionId: input.referenceExternalTransactionId,
  });
  const result = await processPersistedWagerTransaction({
    em,
    transaction,
    ledgerEntryId: randomUUID(),
    correlationId: input.idempotencyKey,
  });

  return {
    transactionId: result.transaction.id,
    status: result.transaction.status,
    balance: result.wallet.balance.toJSON(),
    idempotentReplay: false,
  };
}
