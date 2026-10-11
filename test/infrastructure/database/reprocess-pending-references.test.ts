import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { hashBusinessPayload } from "../../../src/application/payload-hash";
import { WagerTransactionKind, WagerTransactionStatus } from "../../../src/domain/wager-transaction";
import { WagerTransactionRecord } from "../../../src/infrastructure/database/entities/wager-transaction.record";
import { WalletLedgerEntryRecord } from "../../../src/infrastructure/database/entities/wallet-ledger-entry.record";
import { WalletRecord } from "../../../src/infrastructure/database/entities/wallet.record";
import config from "../../../src/infrastructure/database/mikro-orm.config";
import { processHttpWagerTransaction } from "../../../src/infrastructure/database/process-http-wager-transaction";
import { reprocessPendingReferences } from "../../../src/infrastructure/database/reprocess-pending-references";

let orm: MikroORM;

describe("reprocessPendingReferences", () => {
  beforeAll(async () => {
    orm = await MikroORM.init(config);
    await orm.getMigrator().up();
  });

  afterAll(async () => {
    await orm.getMigrator().down();
    await orm.close(true);
  });

  test("processes refund delivered before its reference after the reference exists", async () => {
    const walletId = randomUUID();
    const playerId = randomUUID();
    const now = new Date("2026-01-01T00:00:00.000Z");
    await orm.em.fork().persistAndFlush(Object.assign(new WalletRecord(), {
      id: walletId,
      playerId,
      currency: "BRL",
      balanceAmount: "100.00",
      version: 1,
      createdAt: now,
      updatedAt: now,
    }));

    const betExternalId = `bet-${randomUUID()}`;
    const refund = input({
      walletId,
      playerId,
      externalTransactionId: `refund-${randomUUID()}`,
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: betExternalId,
    });
    const pending = await processHttpWagerTransaction(orm.em.fork(), refund);
    const bet = input({
      walletId,
      playerId,
      externalTransactionId: betExternalId,
      kind: WagerTransactionKind.Bet,
    });
    await processHttpWagerTransaction(orm.em.fork(), bet);

    const processed = await reprocessPendingReferences({
      em: orm.em.fork(),
      now: new Date("2030-01-01T00:00:05.000Z"),
    });

    const em = orm.em.fork();
    const wallet = await em.findOneOrFail(WalletRecord, { id: walletId });
    const refundRecord = await em.findOneOrFail(WagerTransactionRecord, { id: pending.transactionId });
    const ledgerEntries = await em.find(WalletLedgerEntryRecord, { walletId });

    expect(processed.processed).toBe(1);
    expect(refundRecord.status).toBe(WagerTransactionStatus.Processed);
    expect(typeof refundRecord.referenceTransactionId).toBe("string");
    expect(wallet.balanceAmount).toBe("100.00");
    expect(ledgerEntries).toHaveLength(2);
  });
});

function input(props: {
  walletId: string;
  playerId: string;
  externalTransactionId: string;
  kind: WagerTransactionKind;
  referenceExternalTransactionId?: string;
}) {
  const payload = {
    providerId: "provider-a",
    externalTransactionId: props.externalTransactionId,
    idempotencyKey: `provider-a:${props.externalTransactionId}`,
    playerId: props.playerId,
    walletId: props.walletId,
    roundId: "round-1",
    gameId: "game-1",
    kind: props.kind,
    money: { amount: "25.00", currency: "BRL" },
    referenceExternalTransactionId: props.referenceExternalTransactionId,
  };

  return {
    ...payload,
    payloadHash: hashBusinessPayload(payload),
  };
}
