import { FailureCode } from "../domain/failure-code";
import { LedgerDirection } from "../domain/ledger-direction";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../domain/wager-transaction";
import { Wallet } from "../domain/wallet";
import { WalletLedgerEntry } from "../domain/wallet-ledger-entry";

export interface ProcessWagerTransactionInput {
  wallet: Wallet;
  transaction: WagerTransaction;
  ledgerEntryId: string;
  processedAt?: Date;
  referenceTransaction?: WagerTransaction;
  referenceLookupAttempts?: number;
  maxReferenceLookupAttempts?: number;
  referenceAlreadyReversedBySameKind?: boolean;
}

export interface ProcessWagerTransactionResult {
  transaction: WagerTransaction;
  wallet: Wallet;
  ledgerEntry?: WalletLedgerEntry;
}

export const DEFAULT_REFERENCE_LOOKUP_MAX_ATTEMPTS = 5;

export function processWagerTransaction(
  input: ProcessWagerTransactionInput,
): ProcessWagerTransactionResult {
  const processedAt = input.processedAt ?? new Date();

  if (input.transaction.isTerminal()) {
    return { transaction: input.transaction, wallet: input.wallet };
  }

  if (input.transaction.requiresReference()) {
    const referenceValidation = validateReference(input.transaction, input.referenceTransaction);

    if (referenceValidation === FailureCode.MissingReference) {
      if (
        (input.referenceLookupAttempts ?? 0) >=
        (input.maxReferenceLookupAttempts ?? DEFAULT_REFERENCE_LOOKUP_MAX_ATTEMPTS)
      ) {
        input.transaction.reject(FailureCode.ReferenceNotFound);
        return { transaction: input.transaction, wallet: input.wallet };
      }

      input.transaction.markPendingReference();
      return { transaction: input.transaction, wallet: input.wallet };
    }

    if (referenceValidation) {
      input.transaction.reject(referenceValidation);
      return { transaction: input.transaction, wallet: input.wallet };
    }

    if (input.referenceAlreadyReversedBySameKind) {
      input.transaction.reject(FailureCode.DuplicateReversal);
      return { transaction: input.transaction, wallet: input.wallet };
    }
  }

  if (input.transaction.kind === WagerTransactionKind.Loss) {
    input.transaction.markProcessed(undefined, processedAt);
    return { transaction: input.transaction, wallet: input.wallet };
  }

  const direction = input.transaction.ledgerDirectionFor(input.referenceTransaction);

  try {
    const change =
      direction === LedgerDirection.Debit
        ? input.wallet.debit(input.transaction.money, processedAt)
        : input.wallet.credit(input.transaction.money, processedAt);

    const ledgerEntry = WalletLedgerEntry.create({
      id: input.ledgerEntryId,
      walletId: input.wallet.id,
      transactionId: input.transaction.id,
      direction,
      money: input.transaction.money,
      balanceBefore: change.balanceBefore,
      balanceAfter: change.balanceAfter,
    });

    input.transaction.markProcessed(input.referenceTransaction?.id, processedAt);

    return { transaction: input.transaction, wallet: input.wallet, ledgerEntry };
  } catch (error) {
    if (error instanceof Error && error.message === "Insufficient balance") {
      input.transaction.reject(
        input.transaction.kind === WagerTransactionKind.Rollback
          ? FailureCode.RollbackWouldMakeBalanceNegative
          : FailureCode.InsufficientBalance,
      );
      return { transaction: input.transaction, wallet: input.wallet };
    }

    throw error;
  }
}

function validateReference(
  transaction: WagerTransaction,
  reference: WagerTransaction | undefined,
): FailureCode | undefined {
  if (!reference) {
    return FailureCode.MissingReference;
  }

  if (
    reference.status !== WagerTransactionStatus.Processed ||
    reference.providerId !== transaction.providerId ||
    reference.externalTransactionId !== transaction.referenceExternalTransactionId ||
    reference.playerId !== transaction.playerId ||
    reference.walletId !== transaction.walletId ||
    reference.money.currency !== transaction.money.currency ||
    reference.roundId !== transaction.roundId ||
    !reference.money.equals(transaction.money)
  ) {
    return FailureCode.InvalidReference;
  }

  if (
    transaction.kind === WagerTransactionKind.Refund &&
    reference.kind !== WagerTransactionKind.Bet
  ) {
    return FailureCode.InvalidReference;
  }

  if (
    transaction.kind === WagerTransactionKind.Rollback &&
    reference.kind !== WagerTransactionKind.Bet &&
    reference.kind !== WagerTransactionKind.Win &&
    reference.kind !== WagerTransactionKind.Refund
  ) {
    return FailureCode.InvalidReference;
  }

  return undefined;
}

export function nextPendingReferenceAttemptAt(attempts: number, now: Date): Date {
  const delaySeconds = Math.min(2 ** Math.max(attempts, 1), 300);
  return new Date(now.getTime() + delaySeconds * 1000);
}
