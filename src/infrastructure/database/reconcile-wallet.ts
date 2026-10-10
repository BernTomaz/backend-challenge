import { EntityManager } from "@mikro-orm/postgresql";
import { LedgerDirection } from "../../domain/ledger-direction";
import { Money, MoneyProps } from "../../domain/money";
import { logWarn, metrics } from "../observability/observability";
import { WalletLedgerEntryRecord } from "./entities/wallet-ledger-entry.record";
import { WalletRecord } from "./entities/wallet.record";

export interface WalletReconciliation {
  walletId: string;
  storedBalance: MoneyProps;
  calculatedBalance: MoneyProps;
  difference: MoneyProps;
  consistent: boolean;
  checkedEntries: number;
}

export async function reconcileWallet(
  em: EntityManager,
  wallet: WalletRecord,
): Promise<WalletReconciliation> {
  const entries = await em.find(
    WalletLedgerEntryRecord,
    { walletId: wallet.id },
    { orderBy: { createdAt: "asc", id: "asc" } },
  );
  const zero = Money.zero(wallet.currency);
  const calculated = entries.reduce((balance, entry) => {
    const money = Money.from({ amount: entry.amount, currency: entry.currency });
    return entry.direction === LedgerDirection.Credit
      ? balance.add(money)
      : balance.subtract(money);
  }, zero);
  const stored = Money.from({ amount: wallet.balanceAmount, currency: wallet.currency });
  const difference = stored.subtract(calculated);
  const consistent = difference.isZero();

  if (!consistent) {
    metrics.reconciliationDivergences += 1;
    logWarn("wallet_reconciliation_divergence", {
      walletId: wallet.id,
      checkedEntries: entries.length,
    });
  }

  return {
    walletId: wallet.id,
    storedBalance: stored.toJSON(),
    calculatedBalance: calculated.toJSON(),
    difference: difference.toJSON(),
    consistent,
    checkedEntries: entries.length,
  };
}
