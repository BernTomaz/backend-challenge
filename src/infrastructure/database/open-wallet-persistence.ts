import { EntityManager } from "@mikro-orm/postgresql";
import { WagerTransactionKind, WagerTransactionStatus } from "../../domain/wager-transaction";
import { OpenWalletInput, OpenWalletResult, openWallet } from "../../application/open-wallet";
import { WagerTransactionRecord } from "./entities/wager-transaction.record";
import { WalletLedgerEntryRecord } from "./entities/wallet-ledger-entry.record";
import { WalletRecord } from "./entities/wallet.record";

export function persistOpenWallet(
  em: EntityManager,
  input: OpenWalletInput,
): Promise<OpenWalletResult> {
  return em.transactional(async (tx) => {
    const result = openWallet(input);
    const walletJson = result.wallet.balance.toJSON();
    const now = result.wallet.createdAt;

    tx.persist(
      Object.assign(new WalletRecord(), {
        id: result.wallet.id,
        playerId: result.wallet.playerId,
        currency: result.wallet.currency,
        balanceAmount: walletJson.amount,
        version: result.wallet.version,
        createdAt: result.wallet.createdAt,
        updatedAt: result.wallet.updatedAt,
      }),
    );

    if (result.openingTransaction) {
      tx.persist(
        Object.assign(new WagerTransactionRecord(), {
          id: result.openingTransaction.id,
          providerId: "internal",
          externalTransactionId: result.openingTransaction.id,
          idempotencyKey: `internal:${result.openingTransaction.id}`,
          payloadHash: "0".repeat(64),
          walletId: result.wallet.id,
          playerId: result.wallet.playerId,
          roundId: "opening",
          gameId: "opening",
          kind: WagerTransactionKind.Opening,
          amount: result.openingTransaction.money.toJSON().amount,
          currency: result.openingTransaction.money.currency,
          status: WagerTransactionStatus.Processed,
          observedBalanceAmount: walletJson.amount,
          observedBalanceCurrency: result.wallet.currency,
          createdAt: now,
          processedAt: result.openingTransaction.processedAt,
        }),
      );
    }

    if (result.ledgerEntry) {
      tx.persist(
        Object.assign(new WalletLedgerEntryRecord(), {
          id: result.ledgerEntry.id,
          walletId: result.ledgerEntry.walletId,
          transactionId: result.ledgerEntry.transactionId,
          direction: result.ledgerEntry.direction,
          amount: result.ledgerEntry.money.toJSON().amount,
          currency: result.ledgerEntry.money.currency,
          balanceBefore: result.ledgerEntry.balanceBefore.toJSON().amount,
          balanceAfter: result.ledgerEntry.balanceAfter.toJSON().amount,
          createdAt: result.ledgerEntry.createdAt,
        }),
      );
    }

    return result;
  });
}
