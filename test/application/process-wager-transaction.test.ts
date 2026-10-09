import { describe, expect, test } from "bun:test";
import {
  nextPendingReferenceAttemptAt,
  processWagerTransaction,
} from "../../src/application/process-wager-transaction";
import { FailureCode } from "../../src/domain/failure-code";
import { LedgerDirection } from "../../src/domain/ledger-direction";
import { Money } from "../../src/domain/money";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../src/domain/wager-transaction";
import { Wallet } from "../../src/domain/wallet";

const processedAt = new Date("2026-01-01T00:00:00.000Z");

function wallet(balance = "100.00"): Wallet {
  return Wallet.open({
    id: "wallet-1",
    playerId: "player-1",
    initialBalance: Money.from({ amount: balance, currency: "BRL" }),
  });
}

function transaction(
  kind: WagerTransactionKind,
  amount = "25.00",
  referenceExternalTransactionId?: string,
): WagerTransaction {
  return WagerTransaction.create({
    id: `${kind}-id`,
    providerId: "provider-a",
    externalTransactionId: `${kind}-external-id`,
    idempotencyKey: `provider-a:${kind}-external-id`,
    payloadHash: "payload-hash",
    walletId: "wallet-1",
    playerId: "player-1",
    roundId: "round-1",
    gameId: "game-1",
    kind,
    money: Money.from({ amount, currency: "BRL" }),
    referenceExternalTransactionId,
  });
}

function processedReference(kind: WagerTransactionKind, amount = "25.00"): WagerTransaction {
  const reference = transaction(kind, amount);
  reference.markProcessed(undefined, processedAt);
  return reference;
}

describe("processWagerTransaction", () => {
  test("processes bet as debit", () => {
    const result = processWagerTransaction({
      wallet: wallet(),
      transaction: transaction(WagerTransactionKind.Bet),
      ledgerEntryId: "ledger-1",
      processedAt,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(result.wallet.balance.toJSON().amount).toBe("75.00");
    expect(result.ledgerEntry?.direction).toBe(LedgerDirection.Debit);
  });

  test("rejects bet with insufficient balance", () => {
    const result = processWagerTransaction({
      wallet: wallet("20.00"),
      transaction: transaction(WagerTransactionKind.Bet),
      ledgerEntryId: "ledger-1",
      processedAt,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.transaction.failureCode).toBe(FailureCode.InsufficientBalance);
    expect(result.wallet.balance.toJSON().amount).toBe("20.00");
    expect(result.ledgerEntry).toBeUndefined();
  });

  test("processes win as credit", () => {
    const result = processWagerTransaction({
      wallet: wallet(),
      transaction: transaction(WagerTransactionKind.Win),
      ledgerEntryId: "ledger-1",
      processedAt,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(result.wallet.balance.toJSON().amount).toBe("125.00");
    expect(result.ledgerEntry?.direction).toBe(LedgerDirection.Credit);
  });

  test("processes loss without ledger", () => {
    const result = processWagerTransaction({
      wallet: wallet(),
      transaction: transaction(WagerTransactionKind.Loss),
      ledgerEntryId: "ledger-1",
      processedAt,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(result.wallet.balance.toJSON().amount).toBe("100.00");
    expect(result.ledgerEntry).toBeUndefined();
  });

  test("marks refund pending when reference is missing", () => {
    const result = processWagerTransaction({
      wallet: wallet(),
      transaction: transaction(WagerTransactionKind.Refund, "25.00", "BET-external-id"),
      ledgerEntryId: "ledger-1",
      processedAt,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.PendingReference);
    expect(result.wallet.balance.toJSON().amount).toBe("100.00");
    expect(result.ledgerEntry).toBeUndefined();
  });

  test("rejects missing reference after max attempts", () => {
    const result = processWagerTransaction({
      wallet: wallet(),
      transaction: transaction(WagerTransactionKind.Rollback, "25.00", "BET-external-id"),
      ledgerEntryId: "ledger-1",
      processedAt,
      referenceLookupAttempts: 5,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.transaction.failureCode).toBe(FailureCode.ReferenceNotFound);
    expect(result.ledgerEntry).toBeUndefined();
  });

  test("calculates pending reference retry backoff", () => {
    expect(nextPendingReferenceAttemptAt(1, processedAt)).toEqual(
      new Date("2026-01-01T00:00:02.000Z"),
    );
    expect(nextPendingReferenceAttemptAt(10, processedAt)).toEqual(
      new Date("2026-01-01T00:05:00.000Z"),
    );
  });

  test("processes refund of processed bet as credit", () => {
    const result = processWagerTransaction({
      wallet: wallet(),
      transaction: transaction(WagerTransactionKind.Refund, "25.00", "BET-external-id"),
      referenceTransaction: processedReference(WagerTransactionKind.Bet),
      ledgerEntryId: "ledger-1",
      processedAt,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(result.wallet.balance.toJSON().amount).toBe("125.00");
    expect(result.ledgerEntry?.direction).toBe(LedgerDirection.Credit);
  });

  test("rejects duplicate refund for same reference", () => {
    const result = processWagerTransaction({
      wallet: wallet(),
      transaction: transaction(WagerTransactionKind.Refund, "25.00", "BET-external-id"),
      referenceTransaction: processedReference(WagerTransactionKind.Bet),
      referenceAlreadyReversedBySameKind: true,
      ledgerEntryId: "ledger-1",
      processedAt,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.transaction.failureCode).toBe(FailureCode.DuplicateReversal);
    expect(result.ledgerEntry).toBeUndefined();
  });

  test("processes rollback with inverted direction", () => {
    const result = processWagerTransaction({
      wallet: wallet(),
      transaction: transaction(WagerTransactionKind.Rollback, "25.00", "WIN-external-id"),
      referenceTransaction: processedReference(WagerTransactionKind.Win),
      ledgerEntryId: "ledger-1",
      processedAt,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Processed);
    expect(result.wallet.balance.toJSON().amount).toBe("75.00");
    expect(result.ledgerEntry?.direction).toBe(LedgerDirection.Debit);
  });

  test("rejects rollback that would make balance negative", () => {
    const result = processWagerTransaction({
      wallet: wallet("20.00"),
      transaction: transaction(WagerTransactionKind.Rollback, "25.00", "WIN-external-id"),
      referenceTransaction: processedReference(WagerTransactionKind.Win),
      ledgerEntryId: "ledger-1",
      processedAt,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.transaction.failureCode).toBe(
      FailureCode.RollbackWouldMakeBalanceNegative,
    );
    expect(result.wallet.balance.toJSON().amount).toBe("20.00");
    expect(result.ledgerEntry).toBeUndefined();
  });

  test("rejects invalid reference", () => {
    const reference = processedReference(WagerTransactionKind.Win);
    const result = processWagerTransaction({
      wallet: wallet(),
      transaction: transaction(WagerTransactionKind.Refund, "25.00", "WIN-external-id"),
      referenceTransaction: reference,
      ledgerEntryId: "ledger-1",
      processedAt,
    });

    expect(result.transaction.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.transaction.failureCode).toBe(FailureCode.InvalidReference);
    expect(result.ledgerEntry).toBeUndefined();
  });
});
