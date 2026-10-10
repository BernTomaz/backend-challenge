import { describe, expect, spyOn, test } from "bun:test";
import { LedgerDirection } from "../../../src/domain/ledger-direction";
import { reconcileWallet } from "../../../src/infrastructure/database/reconcile-wallet";
import { WalletLedgerEntryRecord } from "../../../src/infrastructure/database/entities/wallet-ledger-entry.record";
import { WalletRecord } from "../../../src/infrastructure/database/entities/wallet.record";
import { metrics } from "../../../src/infrastructure/observability/observability";

describe("reconcileWallet", () => {
  test("compares stored balance with ledger balance", async () => {
    const wallet = Object.assign(new WalletRecord(), {
      id: "wallet-1",
      currency: "BRL",
      balanceAmount: "70.00",
    });
    const entries = [
      Object.assign(new WalletLedgerEntryRecord(), {
        walletId: "wallet-1",
        direction: LedgerDirection.Credit,
        amount: "100.00",
        currency: "BRL",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      Object.assign(new WalletLedgerEntryRecord(), {
        walletId: "wallet-1",
        direction: LedgerDirection.Debit,
        amount: "30.00",
        currency: "BRL",
        createdAt: new Date("2026-01-01T00:00:01.000Z"),
      }),
    ];
    const em = {
      find: async () => entries,
    };

    expect(await reconcileWallet(em as never, wallet)).toEqual({
      walletId: "wallet-1",
      storedBalance: { amount: "70.00", currency: "BRL" },
      calculatedBalance: { amount: "70.00", currency: "BRL" },
      difference: { amount: "0.00", currency: "BRL" },
      consistent: true,
      checkedEntries: 2,
    });
  });

  test("logs divergence without changing the response", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    metrics.reconciliationDivergences = 0;
    const wallet = Object.assign(new WalletRecord(), {
      id: "wallet-1",
      currency: "BRL",
      balanceAmount: "75.00",
    });
    const entries = [
      Object.assign(new WalletLedgerEntryRecord(), {
        walletId: "wallet-1",
        direction: LedgerDirection.Credit,
        amount: "100.00",
        currency: "BRL",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ];
    const em = {
      find: async () => entries,
    };

    const result = await reconcileWallet(em as never, wallet);

    expect(result.consistent).toBe(false);
    expect(result.difference).toEqual({ amount: "-25.00", currency: "BRL" });
    const logged = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(logged).toMatchObject({
      level: "warn",
      message: "wallet_reconciliation_divergence",
      walletId: "wallet-1",
    });
    expect(logged.storedBalance).toBeUndefined();
    expect(metrics.reconciliationDivergences).toBe(1);
    warn.mockRestore();
  });
});
