import { randomUUID } from "node:crypto";
import { Money, MoneyProps } from "../domain/money";
import { LedgerDirection } from "../domain/ledger-direction";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../domain/wager-transaction";
import { Wallet } from "../domain/wallet";
import { WalletLedgerEntry } from "../domain/wallet-ledger-entry";

export interface OpenWalletInput {
  playerId: string;
  initialBalance: MoneyProps;
  walletId?: string;
  transactionId?: string;
  ledgerEntryId?: string;
  openedAt?: Date;
}

export interface OpenWalletResult {
  wallet: Wallet;
  openingTransaction?: {
    id: string;
    kind: WagerTransactionKind.Opening;
    status: WagerTransactionStatus.Processed;
    money: Money;
    processedAt: Date;
  };
  ledgerEntry?: WalletLedgerEntry;
}

export function openWallet(input: OpenWalletInput): OpenWalletResult {
  const openedAt = input.openedAt ?? new Date();
  const initialBalance = Money.from(input.initialBalance);
  const wallet = Wallet.open({
    id: input.walletId ?? randomUUID(),
    playerId: input.playerId,
    initialBalance,
  });

  if (initialBalance.isZero()) {
    return { wallet };
  }

  const transactionId = input.transactionId ?? randomUUID();
  const openingTransaction: OpenWalletResult["openingTransaction"] = {
    id: transactionId,
    kind: WagerTransactionKind.Opening,
    status: WagerTransactionStatus.Processed,
    money: initialBalance,
    processedAt: openedAt,
  };
  const ledgerEntry = WalletLedgerEntry.create({
    id: input.ledgerEntryId ?? randomUUID(),
    walletId: wallet.id,
    transactionId,
    direction: LedgerDirection.Credit,
    money: initialBalance,
    balanceBefore: Money.zero(initialBalance.currency),
    balanceAfter: initialBalance,
  });

  return { wallet, openingTransaction, ledgerEntry };
}
