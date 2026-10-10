import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { FailureCode } from "../../../src/domain/failure-code";
import { LedgerDirection } from "../../../src/domain/ledger-direction";
import { Money } from "../../../src/domain/money";
import { hashBusinessPayload } from "../../../src/application/payload-hash";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../../src/domain/wager-transaction";
import config from "../../../src/infrastructure/database/mikro-orm.config";
import { OutboxMessageRecord } from "../../../src/infrastructure/database/entities/outbox-message.record";
import { WalletLedgerEntryRecord } from "../../../src/infrastructure/database/entities/wallet-ledger-entry.record";
import { WagerTransactionRecord } from "../../../src/infrastructure/database/entities/wager-transaction.record";
import { WalletRecord } from "../../../src/infrastructure/database/entities/wallet.record";
import { processHttpWagerTransaction } from "../../../src/infrastructure/database/process-http-wager-transaction";
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
    const outboxMessages = await em.find(OutboxMessageRecord, { aggregateId: walletId });

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
    expect(outboxMessages.map((message) => message.eventType).sort()).toEqual([
      "WagerTransactionProcessed",
      "WagerTransactionRejected",
      "WalletBalanceChanged",
    ]);
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

  test("processes the same bet 50 times in parallel as one debit", async () => {
    const playerId = randomUUID();
    const walletId = randomUUID();
    await persistWalletWithOpeningLedger(walletId, playerId);
    const externalTransactionId = `bet-${randomUUID()}`;
    const input = {
      providerId: "provider-a",
      externalTransactionId,
      idempotencyKey: `provider-a:${externalTransactionId}`,
      playerId,
      walletId,
      roundId: "round-50",
      gameId: "game-1",
      kind: WagerTransactionKind.Bet,
      money: { amount: "25.00", currency: "BRL" },
    };
    const payloadHash = hashBusinessPayload(input);

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        processHttpWagerTransaction(orm.em.fork(), { ...input, payloadHash }),
      ),
    );

    const em = orm.em.fork();
    const storedWallet = await em.findOneOrFail(WalletRecord, { id: walletId });
    const transactions = await em.find(WagerTransactionRecord, { walletId });
    const debits = await em.find(WalletLedgerEntryRecord, {
      walletId,
      direction: LedgerDirection.Debit,
    });

    expect(new Set(results.map((result) => result.transactionId)).size).toBe(1);
    expect(results.filter((result) => result.idempotentReplay)).toHaveLength(49);
    expect(
      transactions.filter((transaction) => transaction.kind === WagerTransactionKind.Bet),
    ).toHaveLength(1);
    expect(debits).toHaveLength(1);
    expect(storedWallet.balanceAmount).toBe("75.00");
    expect(await reconstructedBalance(em, walletId)).toBe(storedWallet.balanceAmount);
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

async function persistWalletWithOpeningLedger(walletId: string, playerId: string): Promise<void> {
  const em = orm.em.fork();
  const now = new Date("2026-01-01T00:00:00.000Z");
  const transactionId = randomUUID();

  await em.persistAndFlush(walletRecord({ walletId, playerId, balance: "100.00", now }));
  await em.persistAndFlush(Object.assign(new WagerTransactionRecord(), {
    id: transactionId,
    providerId: "internal",
    externalTransactionId: transactionId,
    idempotencyKey: `internal:${transactionId}`,
    payloadHash: "0".repeat(64),
    walletId,
    playerId,
    roundId: "opening",
    gameId: "opening",
    kind: WagerTransactionKind.Opening,
    amount: "100.00",
    currency: "BRL",
    status: WagerTransactionStatus.Processed,
    observedBalanceAmount: "100.00",
    observedBalanceCurrency: "BRL",
    createdAt: now,
    processedAt: now,
  }));
  await em.persistAndFlush(Object.assign(new WalletLedgerEntryRecord(), {
    id: randomUUID(),
    walletId,
    transactionId,
    direction: LedgerDirection.Credit,
    amount: "100.00",
    currency: "BRL",
    balanceBefore: "0.00",
    balanceAfter: "100.00",
    createdAt: now,
  }));
}

async function reconstructedBalance(em: EntityManager, walletId: string): Promise<string> {
  const entries = await em.find(
    WalletLedgerEntryRecord,
    { walletId },
    { orderBy: { createdAt: "asc" } },
  );
  const balance = entries.reduce(
    (current, entry) =>
      entry.direction === LedgerDirection.Credit
        ? current.add(Money.from({ amount: entry.amount, currency: entry.currency }))
        : current.subtract(Money.from({ amount: entry.amount, currency: entry.currency })),
    Money.zero("BRL"),
  );

  return balance.toJSON().amount;
}
