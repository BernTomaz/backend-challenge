import { Controller, NotFoundException, Param, Post } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { WalletRecord } from "../infrastructure/database/entities/wallet.record";
import { reconcileWallet } from "../infrastructure/database/reconcile-wallet";

@Controller("wallets/:walletId/reconciliation")
export class ReconciliationController {
  constructor(private readonly em: EntityManager) {}

  @Post()
  async reconcile(@Param("walletId") walletId: string) {
    const wallet = await this.em.findOne(WalletRecord, { id: walletId });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    return reconcileWallet(this.em, wallet);
  }
}
