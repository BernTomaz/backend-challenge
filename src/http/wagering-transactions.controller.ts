import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { WagerTransactionRecord } from "../infrastructure/database/entities/wager-transaction.record";

@Controller()
export class WageringTransactionsController {
  constructor(private readonly em: EntityManager) {}

  @Get("wagering/transactions/:transactionId")
  async findById(@Param("transactionId") transactionId: string) {
    const transaction = await this.em.findOne(WagerTransactionRecord, { id: transactionId });

    if (!transaction) {
      throw new NotFoundException("Transaction not found");
    }

    return toResponse(transaction);
  }

  @Get("providers/:providerId/wagering/transactions/:externalTransactionId")
  async findByProviderTransaction(
    @Param("providerId") providerId: string,
    @Param("externalTransactionId") externalTransactionId: string,
  ) {
    const transaction = await this.em.findOne(WagerTransactionRecord, {
      providerId,
      externalTransactionId,
    });

    if (!transaction) {
      throw new NotFoundException("Transaction not found");
    }

    return toResponse(transaction);
  }
}

function toResponse(transaction: WagerTransactionRecord) {
  return {
    id: transaction.id,
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    walletId: transaction.walletId,
    playerId: transaction.playerId,
    roundId: transaction.roundId,
    gameId: transaction.gameId,
    kind: transaction.kind,
    status: transaction.status,
    money: {
      amount: transaction.amount,
      currency: transaction.currency,
    },
    referenceExternalTransactionId: transaction.referenceExternalTransactionId,
    referenceTransactionId: transaction.referenceTransactionId,
    failureCode: transaction.failureCode,
    createdAt: transaction.createdAt.toISOString(),
    processedAt: transaction.processedAt?.toISOString(),
  };
}
