import { randomUUID } from "node:crypto";
import { FailureCode } from "./failure-code";
import { IntegrationEvent } from "./integration-event";
import { LedgerDirection } from "./ledger-direction";
import { MoneyProps } from "./money";
import { WagerTransaction, WagerTransactionStatus } from "./wager-transaction";
import { Wallet } from "./wallet";
import { WalletLedgerEntry } from "./wallet-ledger-entry";

export interface EventContext {
  correlationId: string;
  causationId?: string;
  occurredAt?: Date;
}

interface WagerTransactionEventData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  status: WagerTransactionStatus;
  failureCode?: FailureCode;
}

interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionEventData> {
  readonly eventType = "WagerTransactionProcessed";
  readonly version = 1;

  static from(transaction: WagerTransaction, ctx: EventContext): WagerTransactionProcessed {
    return new WagerTransactionProcessed({
      eventId: randomUUID(),
      aggregateId: transaction.walletId,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: ctx.occurredAt ?? new Date(),
      data: transactionData(transaction),
    });
  }
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionEventData> {
  readonly eventType = "WagerTransactionRejected";
  readonly version = 1;

  static from(transaction: WagerTransaction, ctx: EventContext): WagerTransactionRejected {
    return new WagerTransactionRejected({
      eventId: randomUUID(),
      aggregateId: transaction.walletId,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: ctx.occurredAt ?? new Date(),
      data: transactionData(transaction),
    });
  }
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionEventData> {
  readonly eventType = "WagerTransactionPendingReference";
  readonly version = 1;

  static from(transaction: WagerTransaction, ctx: EventContext): WagerTransactionPendingReference {
    return new WagerTransactionPendingReference({
      eventId: randomUUID(),
      aggregateId: transaction.walletId,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: ctx.occurredAt ?? new Date(),
      data: transactionData(transaction),
    });
  }
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = "WalletBalanceChanged";
  readonly version = 1;

  static from(
    wallet: Wallet,
    entry: WalletLedgerEntry,
    ctx: EventContext,
  ): WalletBalanceChanged {
    return new WalletBalanceChanged({
      eventId: randomUUID(),
      aggregateId: wallet.id,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: ctx.occurredAt ?? new Date(),
      data: {
        walletId: wallet.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: entry.money.toJSON(),
        balanceBefore: entry.balanceBefore.toJSON(),
        balanceAfter: entry.balanceAfter.toJSON(),
        walletVersion: wallet.version,
      },
    });
  }
}

function transactionData(transaction: WagerTransaction): WagerTransactionEventData {
  return {
    transactionId: transaction.id,
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    walletId: transaction.walletId,
    playerId: transaction.playerId,
    status: transaction.status,
    failureCode: transaction.failureCode,
  };
}
