import { EntityManager, LockMode } from "@mikro-orm/postgresql";
import { metrics } from "../observability/observability";
import { WalletRecord } from "./entities/wallet.record";

export function withLockedWallet<T>(
  em: EntityManager,
  walletId: string,
  work: (tx: EntityManager, wallet: WalletRecord) => Promise<T>,
): Promise<T> {
  return em.transactional(async (tx) => {
    let wallet: WalletRecord;

    try {
      wallet = await tx.findOneOrFail(
        WalletRecord,
        { id: walletId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
    } catch (error) {
      if (isLockConflict(error)) {
        metrics.lockConflicts += 1;
      }

      throw error;
    }

    return work(tx, wallet);
  });
}

function isLockConflict(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes("deadlock detected") ||
    error.message.includes("could not obtain lock")
  );
}
