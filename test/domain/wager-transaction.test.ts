import { describe, expect, test } from "bun:test";
import { FailureCode } from "../../src/domain/failure-code";
import { LedgerDirection } from "../../src/domain/ledger-direction";
import { Money } from "../../src/domain/money";
import {
  InvalidTransactionStateError,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../src/domain/wager-transaction";

const money = Money.from({ amount: "25.00", currency: "BRL" });

function transaction(
  kind: WagerTransactionKind,
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
    money,
    referenceExternalTransactionId,
  });
}

describe("WagerTransaction", () => {
  test("creates pending transaction", () => {
    const wagerTransaction = transaction(WagerTransactionKind.Bet);

    expect(wagerTransaction.status).toBe(WagerTransactionStatus.Pending);
    expect(wagerTransaction.isTerminal()).toBe(false);
    expect(wagerTransaction.matchesPayload("payload-hash")).toBe(true);
    expect(wagerTransaction.matchesPayload("other-hash")).toBe(false);
  });

  test("requires reference for refund and rollback", () => {
    expect(() => transaction(WagerTransactionKind.Refund)).toThrow(
      "Reference transaction is required",
    );
    expect(() => transaction(WagerTransactionKind.Rollback)).toThrow(
      "Reference transaction is required",
    );

    expect(transaction(WagerTransactionKind.Refund, "bet-1").requiresReference()).toBe(true);
    expect(transaction(WagerTransactionKind.Rollback, "bet-1").requiresReference()).toBe(true);
  });

  test("marks processed with reference and timestamp", () => {
    const processedAt = new Date("2026-01-01T00:00:00.000Z");
    const wagerTransaction = transaction(WagerTransactionKind.Refund, "bet-1");

    wagerTransaction.markProcessed("internal-bet-id", processedAt);

    expect(wagerTransaction.status).toBe(WagerTransactionStatus.Processed);
    expect(wagerTransaction.referenceTransactionId).toBe("internal-bet-id");
    expect(wagerTransaction.processedAt).toBe(processedAt);
    expect(wagerTransaction.isTerminal()).toBe(true);
  });

  test("marks pending reference, rejected and failed", () => {
    const pendingReference = transaction(WagerTransactionKind.Rollback, "bet-1");
    pendingReference.markPendingReference();
    expect(pendingReference.status).toBe(WagerTransactionStatus.PendingReference);

    const rejected = transaction(WagerTransactionKind.Bet);
    rejected.reject(FailureCode.InsufficientBalance);
    expect(rejected.status).toBe(WagerTransactionStatus.Rejected);
    expect(rejected.failureCode).toBe(FailureCode.InsufficientBalance);

    const failed = transaction(WagerTransactionKind.Bet);
    failed.fail(FailureCode.InfrastructureFailure);
    expect(failed.status).toBe(WagerTransactionStatus.Failed);
    expect(failed.failureCode).toBe(FailureCode.InfrastructureFailure);
  });

  test("does not change terminal transactions", () => {
    const wagerTransaction = transaction(WagerTransactionKind.Bet);
    wagerTransaction.reject(FailureCode.InsufficientBalance);

    expect(() => wagerTransaction.markProcessed(undefined, new Date())).toThrow(
      InvalidTransactionStateError,
    );
    expect(() => wagerTransaction.markPendingReference()).toThrow(
      InvalidTransactionStateError,
    );
    expect(() => wagerTransaction.fail(FailureCode.InfrastructureFailure)).toThrow(
      InvalidTransactionStateError,
    );
  });

  test("detects balance-affecting transactions", () => {
    expect(transaction(WagerTransactionKind.Bet).affectsBalance()).toBe(true);
    expect(transaction(WagerTransactionKind.Win).affectsBalance()).toBe(true);
    expect(transaction(WagerTransactionKind.Refund, "bet-1").affectsBalance()).toBe(true);
    expect(transaction(WagerTransactionKind.Rollback, "bet-1").affectsBalance()).toBe(true);
    expect(transaction(WagerTransactionKind.Loss).affectsBalance()).toBe(false);
  });

  test("calculates ledger direction", () => {
    const bet = transaction(WagerTransactionKind.Bet);
    const win = transaction(WagerTransactionKind.Win);
    const refund = transaction(WagerTransactionKind.Refund, "bet-1");
    const rollbackBet = transaction(WagerTransactionKind.Rollback, "bet-1");
    const rollbackWin = transaction(WagerTransactionKind.Rollback, "win-1");

    expect(bet.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
    expect(win.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    expect(refund.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    expect(rollbackBet.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
    expect(rollbackWin.ledgerDirectionFor(win)).toBe(LedgerDirection.Debit);
    expect(() => transaction(WagerTransactionKind.Loss).ledgerDirectionFor()).toThrow(
      "Transaction does not produce ledger entry",
    );
  });

  test("rehydrates persisted state", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const processedAt = new Date("2026-01-02T00:00:00.000Z");
    const wagerTransaction = WagerTransaction.rehydrate({
      id: "transaction-1",
      providerId: "provider-a",
      externalTransactionId: "external-1",
      idempotencyKey: "provider-a:external-1",
      payloadHash: "payload-hash",
      walletId: "wallet-1",
      playerId: "player-1",
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Win,
      money,
      createdAt,
      status: WagerTransactionStatus.Processed,
      processedAt,
    });

    expect(wagerTransaction.status).toBe(WagerTransactionStatus.Processed);
    expect(wagerTransaction.createdAt).toBe(createdAt);
    expect(wagerTransaction.processedAt).toBe(processedAt);
  });
});
