import { describe, expect, test } from "bun:test";
import { LedgerDirection } from "../../src/domain/ledger-direction";
import { Money } from "../../src/domain/money";
import { WalletLedgerEntry } from "../../src/domain/wallet-ledger-entry";

describe("WalletLedgerEntry", () => {
  test("creates balanced debit entry", () => {
    const entry = WalletLedgerEntry.create({
      id: "entry-1",
      walletId: "wallet-1",
      transactionId: "transaction-1",
      direction: LedgerDirection.Debit,
      money: Money.from({ amount: "25.00", currency: "BRL" }),
      balanceBefore: Money.from({ amount: "100.00", currency: "BRL" }),
      balanceAfter: Money.from({ amount: "75.00", currency: "BRL" }),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.direction).toBe(LedgerDirection.Debit);
  });

  test("creates balanced credit entry", () => {
    const entry = WalletLedgerEntry.create({
      id: "entry-1",
      walletId: "wallet-1",
      transactionId: "transaction-1",
      direction: LedgerDirection.Credit,
      money: Money.from({ amount: "25.00", currency: "BRL" }),
      balanceBefore: Money.from({ amount: "100.00", currency: "BRL" }),
      balanceAfter: Money.from({ amount: "125.00", currency: "BRL" }),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.direction).toBe(LedgerDirection.Credit);
  });

  test("rejects unbalanced entry", () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: "entry-1",
        walletId: "wallet-1",
        transactionId: "transaction-1",
        direction: LedgerDirection.Debit,
        money: Money.from({ amount: "25.00", currency: "BRL" }),
        balanceBefore: Money.from({ amount: "100.00", currency: "BRL" }),
        balanceAfter: Money.from({ amount: "80.00", currency: "BRL" }),
      }),
    ).toThrow("Ledger entry is not balanced");
  });

  test("rehydrates persisted entry", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const entry = WalletLedgerEntry.rehydrate({
      id: "entry-1",
      walletId: "wallet-1",
      transactionId: "transaction-1",
      direction: LedgerDirection.Credit,
      money: Money.from({ amount: "10.00", currency: "BRL" }),
      balanceBefore: Money.from({ amount: "10.00", currency: "BRL" }),
      balanceAfter: Money.from({ amount: "20.00", currency: "BRL" }),
      createdAt,
    });

    expect(entry.createdAt).toBe(createdAt);
    expect(entry.isBalanced()).toBe(true);
  });
});
