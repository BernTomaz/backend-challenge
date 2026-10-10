import { describe, expect, test } from "bun:test";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../../src/domain/wager-transaction";
import {
  IdempotencyConflictError,
  processHttpWagerTransaction,
} from "../../../src/infrastructure/database/process-http-wager-transaction";

describe("processHttpWagerTransaction", () => {
  test("replays identical idempotency key with persisted result", async () => {
    const em = {
      findOne: async () => ({
        id: "transaction-1",
        payloadHash: "hash-1",
        status: WagerTransactionStatus.Processed,
        observedBalanceAmount: "75.00",
        observedBalanceCurrency: "BRL",
      }),
    } as unknown as EntityManager;

    const result = await processHttpWagerTransaction(em, {
      idempotencyKey: "provider-a:external-1",
      payloadHash: "hash-1",
      providerId: "provider-a",
      externalTransactionId: "external-1",
      playerId: "player-1",
      walletId: "wallet-1",
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Bet,
      money: { amount: "25.00", currency: "BRL" },
    });

    expect(result).toEqual({
      transactionId: "transaction-1",
      status: WagerTransactionStatus.Processed,
      balance: { amount: "75.00", currency: "BRL" },
      idempotentReplay: true,
    });
  });

  test("replays non-ledger transaction with observed balance", async () => {
    const em = {
      findOne: async () => ({
        id: "transaction-1",
        payloadHash: "hash-1",
        status: WagerTransactionStatus.Processed,
        observedBalanceAmount: "100.00",
        observedBalanceCurrency: "BRL",
      }),
    } as unknown as EntityManager;

    const result = await processHttpWagerTransaction(em, {
      idempotencyKey: "provider-a:external-1",
      payloadHash: "hash-1",
      providerId: "provider-a",
      externalTransactionId: "external-1",
      playerId: "player-1",
      walletId: "wallet-1",
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Loss,
      money: { amount: "25.00", currency: "BRL" },
    });

    expect(result.balance).toEqual({ amount: "100.00", currency: "BRL" });
    expect(result.idempotentReplay).toBe(true);
  });

  test("rejects same idempotency key with different payload", async () => {
    const em = {
      findOne: async () => ({
        id: "transaction-1",
        payloadHash: "hash-1",
        status: WagerTransactionStatus.Processed,
      }),
    } as unknown as EntityManager;

    await expect(
      processHttpWagerTransaction(em, {
        idempotencyKey: "provider-a:external-1",
        payloadHash: "hash-2",
        providerId: "provider-a",
        externalTransactionId: "external-1",
        playerId: "player-1",
        walletId: "wallet-1",
        roundId: "round-1",
        gameId: "game-1",
        kind: WagerTransactionKind.Bet,
        money: { amount: "25.00", currency: "BRL" },
      }),
    ).rejects.toThrow(IdempotencyConflictError);
  });
});
