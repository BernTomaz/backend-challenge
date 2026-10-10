import { describe, expect, test } from "bun:test";
import { LedgerDirection } from "../../src/domain/ledger-direction";
import { Money } from "../../src/domain/money";
import { WagerTransaction, WagerTransactionKind } from "../../src/domain/wager-transaction";
import { Wallet } from "../../src/domain/wallet";
import { WalletBalanceChanged, WagerTransactionProcessed } from "../../src/domain/wagering-events";
import { WalletLedgerEntry } from "../../src/domain/wallet-ledger-entry";

describe("wagering integration events", () => {
  test("serializes event envelope with correlation and version", () => {
    const transaction = WagerTransaction.create({
      id: "transaction-1",
      providerId: "provider-a",
      externalTransactionId: "external-1",
      idempotencyKey: "provider-a:external-1",
      payloadHash: "a".repeat(64),
      walletId: "wallet-1",
      playerId: "player-1",
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Loss,
      money: Money.from({ amount: "25.00", currency: "BRL" }),
    });
    transaction.markProcessed(undefined, new Date("2026-01-01T00:00:00.000Z"));

    const event = WagerTransactionProcessed.from(transaction, {
      correlationId: "provider-a:external-1",
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(event.toJSON()).toMatchObject({
      eventType: "WagerTransactionProcessed",
      aggregateId: "wallet-1",
      correlationId: "provider-a:external-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      version: 1,
      data: { transactionId: "transaction-1" },
    });
  });

  test("serializes wallet balance change with MoneyProps", () => {
    const wallet = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "75.00", currency: "BRL" }),
    });
    const entry = WalletLedgerEntry.create({
      id: "entry-1",
      walletId: "wallet-1",
      transactionId: "transaction-1",
      direction: LedgerDirection.Debit,
      money: Money.from({ amount: "25.00", currency: "BRL" }),
      balanceBefore: Money.from({ amount: "100.00", currency: "BRL" }),
      balanceAfter: Money.from({ amount: "75.00", currency: "BRL" }),
    });

    const event = WalletBalanceChanged.from(wallet, entry, {
      correlationId: "provider-a:external-1",
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(event.toJSON().data).toMatchObject({
      walletId: "wallet-1",
      money: { amount: "25.00", currency: "BRL" },
      balanceBefore: { amount: "100.00", currency: "BRL" },
      balanceAfter: { amount: "75.00", currency: "BRL" },
    });
  });
});
