import { describe, expect, test } from "bun:test";
import { Money } from "../../src/domain/money";
import { Wallet } from "../../src/domain/wallet";

describe("Wallet", () => {
  test("opens with initial balance and version 1", () => {
    const wallet = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });

    expect(wallet.id).toBe("wallet-1");
    expect(wallet.playerId).toBe("player-1");
    expect(wallet.currency).toBe("BRL");
    expect(wallet.balance.toJSON().amount).toBe("100.00");
    expect(wallet.version).toBe(1);
  });

  test("debits and increments version when balance changes", () => {
    const wallet = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });

    const change = wallet.debit(Money.from({ amount: "25.00", currency: "BRL" }));

    expect(change.balanceBefore.toJSON().amount).toBe("100.00");
    expect(change.balanceAfter.toJSON().amount).toBe("75.00");
    expect(wallet.balance.toJSON().amount).toBe("75.00");
    expect(wallet.version).toBe(2);
  });

  test("credits and increments version when balance changes", () => {
    const wallet = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.zero("BRL"),
    });

    wallet.credit(Money.from({ amount: "10.00", currency: "BRL" }));

    expect(wallet.balance.toJSON().amount).toBe("10.00");
    expect(wallet.version).toBe(2);
  });

  test("rejects debit that would make balance negative", () => {
    const wallet = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "20.00", currency: "BRL" }),
    });

    expect(() => wallet.debit(Money.from({ amount: "20.01", currency: "BRL" }))).toThrow(
      "Insufficient balance",
    );
    expect(wallet.balance.toJSON().amount).toBe("20.00");
    expect(wallet.version).toBe(1);
  });

  test("rejects operations with a different currency", () => {
    const wallet = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "20.00", currency: "BRL" }),
    });

    expect(() => wallet.debit(Money.from({ amount: "1.00", currency: "USD" }))).toThrow(
      "Currency mismatch",
    );
    expect(() => wallet.credit(Money.from({ amount: "1.00", currency: "USD" }))).toThrow(
      "Currency mismatch",
    );
  });

  test("rehydrates without changing persisted state", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const updatedAt = new Date("2026-01-02T00:00:00.000Z");
    const wallet = Wallet.rehydrate({
      id: "wallet-1",
      playerId: "player-1",
      currency: "BRL",
      balance: Money.from({ amount: "50.00", currency: "BRL" }),
      version: 7,
      createdAt,
      updatedAt,
    });

    expect(wallet.balance.toJSON().amount).toBe("50.00");
    expect(wallet.version).toBe(7);
    expect(wallet.createdAt).toBe(createdAt);
    expect(wallet.updatedAt).toBe(updatedAt);
  });
});
