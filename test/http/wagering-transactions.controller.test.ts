import { describe, expect, test } from "bun:test";
import { WagerTransactionKind, WagerTransactionStatus } from "../../src/domain/wager-transaction";
import { WagerTransactionRecord } from "../../src/infrastructure/database/entities/wager-transaction.record";

describe("WageringTransactionsController response", () => {
  test("serializes transaction money and timestamps", async () => {
    const { WageringTransactionsController } = await import(
      "../../src/http/wagering-transactions.controller"
    );
    const transaction = Object.assign(new WagerTransactionRecord(), {
      id: "transaction-1",
      providerId: "provider-a",
      externalTransactionId: "external-1",
      walletId: "wallet-1",
      playerId: "player-1",
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Bet,
      status: WagerTransactionStatus.Processed,
      amount: "25.00",
      currency: "BRL",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      processedAt: new Date("2026-01-01T00:00:01.000Z"),
    });
    const em = {
      findOne: async () => transaction,
    };
    const controller = new WageringTransactionsController(em as never);

    expect(await controller.findById("transaction-1")).toMatchObject({
      id: "transaction-1",
      money: { amount: "25.00", currency: "BRL" },
      createdAt: "2026-01-01T00:00:00.000Z",
      processedAt: "2026-01-01T00:00:01.000Z",
    });
  });
});
