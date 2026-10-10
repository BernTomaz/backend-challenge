import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { InboxMessageRecord } from "./entities/inbox-message.record";
import { OutboxMessageRecord } from "./entities/outbox-message.record";
import { WagerTransactionRecord } from "./entities/wager-transaction.record";
import { WalletLedgerEntryRecord } from "./entities/wallet-ledger-entry.record";
import { WalletRecord } from "./entities/wallet.record";

export default defineConfig({
  clientUrl: process.env.DATABASE_URL ?? "postgresql://wagering:wagering@localhost:5432/wagering",
  entities: [
    WalletRecord,
    WagerTransactionRecord,
    WalletLedgerEntryRecord,
    InboxMessageRecord,
    OutboxMessageRecord,
  ],
  migrations: {
    path: "src/infrastructure/database/migrations",
    transactional: true,
    allOrNothing: true,
  },
  extensions: [Migrator],
});
