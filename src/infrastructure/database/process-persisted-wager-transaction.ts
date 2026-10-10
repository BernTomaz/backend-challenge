import { EntityManager } from "@mikro-orm/postgresql";
import { Money } from "../../domain/money";
import {
  processWagerTransaction,
  ProcessWagerTransactionResult,
} from "../../application/process-wager-transaction";
import { OutboxMessage } from "../../domain/outbox-message";
import { WagerTransaction, WagerTransactionStatus } from "../../domain/wager-transaction";
import {
  WalletBalanceChanged,
  WagerTransactionPendingReference,
  WagerTransactionProcessed,
  WagerTransactionRejected,
} from "../../domain/wagering-events";
import { Wallet } from "../../domain/wallet";
import { IntegrationEvent } from "../../domain/integration-event";
import { OutboxMessageRecord } from "./entities/outbox-message.record";
import { WagerTransactionRecord } from "./entities/wager-transaction.record";
import { WalletLedgerEntryRecord } from "./entities/wallet-ledger-entry.record";
import { WalletRecord } from "./entities/wallet.record";
import { withLockedWallet } from "./with-locked-wallet";

export interface ProcessPersistedWagerTransactionInput {
  em: EntityManager;
  transaction: WagerTransaction;
  ledgerEntryId: string;
  processedAt?: Date;
  correlationId?: string;
  causationId?: string;
}

export async function processPersistedWagerTransaction(
  input: ProcessPersistedWagerTransactionInput,
): Promise<ProcessWagerTransactionResult> {
  return withLockedWallet(input.em, input.transaction.walletId, async (tx, walletRecord) => {
    const wallet = Wallet.rehydrate({
      id: walletRecord.id,
      playerId: walletRecord.playerId,
      currency: walletRecord.currency,
      balance: Money.from({
        amount: walletRecord.balanceAmount,
        currency: walletRecord.currency,
      }),
      version: walletRecord.version,
      createdAt: walletRecord.createdAt,
      updatedAt: walletRecord.updatedAt,
    });

    const result = processWagerTransaction({
      wallet,
      transaction: input.transaction,
      ledgerEntryId: input.ledgerEntryId,
      processedAt: input.processedAt,
    });

    walletRecord.balanceAmount = result.wallet.balance.toJSON().amount;
    walletRecord.version = result.wallet.version;
    walletRecord.updatedAt = result.wallet.updatedAt;

    const transactionRecord = toTransactionRecord(result.transaction);
    transactionRecord.observedBalanceAmount = result.wallet.balance.toJSON().amount;
    transactionRecord.observedBalanceCurrency = result.wallet.balance.currency;
    tx.persist(transactionRecord);
    await tx.flush();

    if (result.ledgerEntry) {
      tx.persist(toLedgerRecord(result.ledgerEntry));
    }

    for (const event of eventsFor(result, {
      correlationId: input.correlationId ?? result.transaction.id,
      causationId: input.causationId,
      occurredAt: input.processedAt,
    })) {
      tx.persist(toOutboxRecord(OutboxMessage.enqueue(event)));
    }

    return result;
  });
}

function eventsFor(
  result: ProcessWagerTransactionResult,
  ctx: { correlationId: string; causationId?: string; occurredAt?: Date },
): IntegrationEvent<unknown>[] {
  const events: IntegrationEvent<unknown>[] = [];

  if (result.transaction.status === WagerTransactionStatus.Processed) {
    events.push(WagerTransactionProcessed.from(result.transaction, ctx));
  }

  if (result.transaction.status === WagerTransactionStatus.Rejected) {
    events.push(WagerTransactionRejected.from(result.transaction, ctx));
  }

  if (result.transaction.status === WagerTransactionStatus.PendingReference) {
    events.push(WagerTransactionPendingReference.from(result.transaction, ctx));
  }

  if (result.ledgerEntry) {
    events.push(WalletBalanceChanged.from(result.wallet, result.ledgerEntry, ctx));
  }

  return events;
}

function toTransactionRecord(transaction: WagerTransaction): WagerTransactionRecord {
  const record = new WagerTransactionRecord();
  record.id = transaction.id;
  record.providerId = transaction.providerId;
  record.externalTransactionId = transaction.externalTransactionId;
  record.idempotencyKey = transaction.idempotencyKey;
  record.payloadHash = transaction.payloadHash;
  record.walletId = transaction.walletId;
  record.playerId = transaction.playerId;
  record.roundId = transaction.roundId;
  record.gameId = transaction.gameId;
  record.kind = transaction.kind;
  record.amount = transaction.money.toJSON().amount;
  record.currency = transaction.money.currency;
  record.referenceExternalTransactionId = transaction.referenceExternalTransactionId;
  record.status = transaction.status;
  record.referenceTransactionId = transaction.referenceTransactionId;
  record.failureCode = transaction.failureCode;
  record.createdAt = transaction.createdAt;
  record.processedAt = transaction.processedAt;

  return record;
}

function toLedgerRecord(ledgerEntry: NonNullable<ProcessWagerTransactionResult["ledgerEntry"]>): WalletLedgerEntryRecord {
  const record = new WalletLedgerEntryRecord();
  record.id = ledgerEntry.id;
  record.walletId = ledgerEntry.walletId;
  record.transactionId = ledgerEntry.transactionId;
  record.direction = ledgerEntry.direction;
  record.amount = ledgerEntry.money.toJSON().amount;
  record.currency = ledgerEntry.money.currency;
  record.balanceBefore = ledgerEntry.balanceBefore.toJSON().amount;
  record.balanceAfter = ledgerEntry.balanceAfter.toJSON().amount;
  record.createdAt = ledgerEntry.createdAt;

  return record;
}

function toOutboxRecord(message: OutboxMessage): OutboxMessageRecord {
  const record = new OutboxMessageRecord();
  record.id = message.id;
  record.aggregateId = message.aggregateId;
  record.eventType = message.eventType;
  record.payload = message.payload;
  record.occurredAt = message.occurredAt;
  record.attempts = message.attempts;
  record.nextAttemptAt = message.nextAttemptAt;
  record.publishedAt = message.publishedAt;

  return record;
}
