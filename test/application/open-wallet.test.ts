import { describe, expect, test } from "bun:test";
import { WagerTransactionKind, WagerTransactionStatus } from "../../src/domain/wager-transaction";
import { openWallet } from "../../src/application/open-wallet";
import { LedgerDirection } from "../../src/domain/ledger-direction";

describe("openWallet", () => {
  test("opens wallet without ledger when initial balance is zero", () => {
    const result = openWallet({
      playerId: "player-1",
      initialBalance: { amount: "0.00", currency: "BRL" },
      walletId: "wallet-1",
    });

    expect(result.wallet.id).toBe("wallet-1");
    expect(result.wallet.balance.toJSON()).toEqual({ amount: "0.00", currency: "BRL" });
    expect(result.openingTransaction).toBeUndefined();
    expect(result.ledgerEntry).toBeUndefined();
  });

  test("opens wallet with internal opening transaction and credit ledger", () => {
    const result = openWallet({
      playerId: "player-1",
      initialBalance: { amount: "100.00", currency: "BRL" },
      walletId: "wallet-1",
      transactionId: "transaction-1",
      ledgerEntryId: "ledger-1",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result.wallet.balance.toJSON()).toEqual({ amount: "100.00", currency: "BRL" });
    expect(result.openingTransaction?.kind).toBe(WagerTransactionKind.Opening);
    expect(result.openingTransaction?.status).toBe(WagerTransactionStatus.Processed);
    expect(result.ledgerEntry?.direction).toBe(LedgerDirection.Credit);
    expect(result.ledgerEntry?.balanceBefore.toJSON().amount).toBe("0.00");
    expect(result.ledgerEntry?.balanceAfter.toJSON().amount).toBe("100.00");
  });
});
