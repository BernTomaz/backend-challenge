import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { FailureCode } from "../../../src/domain/failure-code";
import { Money } from "../../../src/domain/money";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../../src/domain/wager-transaction";
import config from "../../../src/infrastructure/database/mikro-orm.config";
import { WalletLedgerEntryRecord } from "../../../src/infrastructure/database/entities/wallet-ledger-entry.record";
import { WagerTransactionRecord } from "../../../src/infrastructure/database/entities/wager-transaction.record";
import { WalletRecord } from "../../../src/infrastructure/database/entities/wallet.record";
import { processPersistedWagerTransaction } from "../../../src/infrastructure/database/process-persisted-wager-transaction";

let orm: MikroORM;

describe("wallet concurrency", () => {
  beforeAll(async () => {
    orm = await MikroORM.init(config);
    await orm.getMigrator().up();
  });

  afterAll(async () => {
    await orm.getMigrator().down();
    await orm.close(true);
  });

  test("processes two competing bets without negative balance or duplicate debit", async () => {
    const walletId = randomUUID();
    const playerId = randomUUID();
    const now = new Date("2026-01-01T00:00:00.000Z");

    await orm.em.fork().persistAndFlush(
      Object.assign(new WalletRecord(), {
        id: walletId,
        playerId,
        currency: "BRL",
        balanceAmount: "100.00",
        version: 1,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const first = bet({ walletId, playerId, index: 1 });
    const second = bet({ walletId, playerId, index: 2 });

    const results = await Promise.all([
      processPersistedWagerTransaction({
        em: orm.em.fork(),
        transaction: first,
        ledgerEntryId: randomUUID(),
        processedAt: now,
      }),
      processPersistedWagerTransaction({
        em: orm.em.fork(),
        transaction: second,
        ledgerEntryId: randomUUID(),
        processedAt: now,
      }),
    ]);

    const statuses = results.map((result) => result.transaction.status).sort();
    expect(statuses).toEqual([
      WagerTransactionStatus.Processed,
      WagerTransactionStatus.Rejected,
    ]);

    const rejected = results.find(
      (result) => result.transaction.status === WagerTransactionStatus.Rejected,
    );
    expect(rejected?.transaction.failureCode).toBe(FailureCode.InsufficientBalance);

    const em = orm.em.fork();
    const wallet = await em.findOneOrFail(WalletRecord, { id: walletId });
    const transactions = await em.find(WagerTransactionRecord, { walletId });
    const ledgerEntries = await em.find(WalletLedgerEntryRecord, { walletId });

    expect(wallet.balanceAmount).toBe("20.00");
    expect(transactions).toHaveLength(2);
    expect(
      transactions.filter(
        (transaction) => transaction.status === WagerTransactionStatus.Processed,
      ),
    ).toHaveLength(1);
    expect(
      transactions.filter(
        (transaction) => transaction.status === WagerTransactionStatus.Rejected,
      ),
    ).toHaveLength(1);
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]?.amount).toBe("80.00");
  });

  test("processes different wallets in parallel", async () => {
    const firstWalletId = randomUUID();
    const secondWalletId = randomUUID();
    const firstPlayerId = randomUUID();
    const secondPlayerId = randomUUID();
    const now = new Date("2026-01-01T00:00:00.000Z");

    await orm.em.fork().persistAndFlush([
      walletRecord({ walletId: firstWalletId, playerId: firstPlayerId, balance: "100.00", now }),
      walletRecord({ walletId: secondWalletId, playerId: secondPlayerId, balance: "100.00", now }),
    ]);

    const results = await Promise.all([
      processPersistedWagerTransaction({
        em: orm.em.fork(),
        transaction: bet({ walletId: firstWalletId, playerId: firstPlayerId, index: 3 }),
        ledgerEntryId: randomUUID(),
        processedAt: now,
      }),
      processPersistedWagerTransaction({
        em: orm.em.fork(),
        transaction: bet({ walletId: secondWalletId, playerId: secondPlayerId, index: 4 }),
        ledgerEntryId: randomUUID(),
        processedAt: now,
      }),
    ]);

    expect(results.map((result) => result.transaction.status)).toEqual([
      WagerTransactionStatus.Processed,
      WagerTransactionStatus.Processed,
    ]);

    const em = orm.em.fork();
    const firstWallet = await em.findOneOrFail(WalletRecord, { id: firstWalletId });
    const secondWallet = await em.findOneOrFail(WalletRecord, { id: secondWalletId });
    const ledgerEntries = await em.find(WalletLedgerEntryRecord, {
      walletId: { $in: [firstWalletId, secondWalletId] },
    });

    expect(firstWallet.balanceAmount).toBe("20.00");
    expect(secondWallet.balanceAmount).toBe("20.00");
    expect(ledgerEntries).toHaveLength(2);
  });

  test("keeps one wallet consistent with three simultaneous bets", async () => {
    const walletId = randomUUID();
    const playerId = randomUUID();
    const now = new Date("2026-01-01T00:00:00.000Z");

    await orm.em.fork().persistAndFlush(
      walletRecord({ walletId, playerId, balance: "100.00", now }),
    );

    const results = await Promise.all(
      [5, 6, 7].map((index) =>
        processPersistedWagerTransaction({
          em: orm.em.fork(),
          transaction: bet({ walletId, playerId, index }),
          ledgerEntryId: randomUUID(),
          processedAt: now,
        }),
      ),
    );

    expect(
      results.filter((result) => result.transaction.status === WagerTransactionStatus.Processed),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.transaction.status === WagerTransactionStatus.Rejected),
    ).toHaveLength(2);

    const em = orm.em.fork();
    const wallet = await em.findOneOrFail(WalletRecord, { id: walletId });
    const ledgerEntries = await em.find(WalletLedgerEntryRecord, { walletId });

    expect(wallet.balanceAmount).toBe("20.00");
    expect(ledgerEntries).toHaveLength(1);
  });
});

function bet(props: { walletId: string; playerId: string; index: number }): WagerTransaction {
  return WagerTransaction.create({
    id: randomUUID(),
    providerId: "provider-a",
    externalTransactionId: `bet-${props.index}`,
    idempotencyKey: `provider-a:bet-${props.index}`,
    payloadHash: "a".repeat(64),
    walletId: props.walletId,
    playerId: props.playerId,
    roundId: "round-1",
    gameId: "game-1",
    kind: WagerTransactionKind.Bet,
    money: Money.from({ amount: "80.00", currency: "BRL" }),
  });
}

function walletRecord(props: {
  walletId: string;
  playerId: string;
  balance: string;
  now: Date;
}): WalletRecord {
  return Object.assign(new WalletRecord(), {
    id: props.walletId,
    playerId: props.playerId,
    currency: "BRL",
    balanceAmount: props.balance,
    version: 1,
    createdAt: props.now,
    updatedAt: props.now,
  });
}
