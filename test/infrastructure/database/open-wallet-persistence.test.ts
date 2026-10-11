import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { WagerTransactionKind } from "../../../src/domain/wager-transaction";
import { WalletLedgerEntryRecord } from "../../../src/infrastructure/database/entities/wallet-ledger-entry.record";
import { WagerTransactionRecord } from "../../../src/infrastructure/database/entities/wager-transaction.record";
import { WalletRecord } from "../../../src/infrastructure/database/entities/wallet.record";
import config from "../../../src/infrastructure/database/mikro-orm.config";
import { persistOpenWallet } from "../../../src/infrastructure/database/open-wallet-persistence";

let orm: MikroORM;

describe("persistOpenWallet", () => {
  beforeAll(async () => {
    orm = await MikroORM.init(config);
    await orm.getMigrator().up();
  });

  afterAll(async () => {
    await orm.getMigrator().down();
    await orm.close(true);
  });

  test("persists wallet, opening transaction and ledger in one transaction", async () => {
    const playerId = randomUUID();
    const result = await persistOpenWallet(orm.em.fork(), {
      playerId,
      initialBalance: { amount: "100.00", currency: "BRL" },
    });

    const em = orm.em.fork();
    const wallet = await em.findOneOrFail(WalletRecord, { id: result.wallet.id });
    const transactions = await em.find(WagerTransactionRecord, { walletId: result.wallet.id });
    const ledgerEntries = await em.find(WalletLedgerEntryRecord, { walletId: result.wallet.id });

    expect(wallet.balanceAmount).toBe("100.00");
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.kind).toBe(WagerTransactionKind.Opening);
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]?.balanceAfter).toBe("100.00");
  });
});
