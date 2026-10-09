import { EntityManager, LockMode } from "@mikro-orm/postgresql";
import { WalletRecord } from "./entities/wallet.record";

export function withLockedWallet<T>(
  em: EntityManager,
  walletId: string,
  work: (tx: EntityManager, wallet: WalletRecord) => Promise<T>,
): Promise<T> {
  return em.transactional(async (tx) => {
    const wallet = await tx.findOneOrFail(
      WalletRecord,
      { id: walletId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );

    return work(tx, wallet);
  });
}
