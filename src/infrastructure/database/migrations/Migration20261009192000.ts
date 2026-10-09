import { Migration } from "@mikro-orm/migrations";

export class Migration20261009192000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "wallets" (
        "id" uuid not null,
        "player_id" uuid not null,
        "currency" varchar(3) not null,
        "balance_amount" numeric(18, 2) not null,
        "version" integer not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "wallets_pkey" primary key ("id"),
        constraint "wallets_player_currency_unique" unique ("player_id", "currency"),
        constraint "wallets_balance_non_negative" check ("balance_amount" >= 0),
        constraint "wallets_version_positive" check ("version" >= 1)
      );
    `);

    this.addSql(`
      create table "wager_transactions" (
        "id" uuid not null,
        "provider_id" varchar(80) not null,
        "external_transaction_id" varchar(120) not null,
        "idempotency_key" varchar(180) not null,
        "payload_hash" char(64) not null,
        "wallet_id" uuid not null,
        "player_id" uuid not null,
        "round_id" varchar(120) not null,
        "game_id" varchar(120) not null,
        "kind" varchar(20) not null,
        "amount" numeric(18, 2) not null,
        "currency" varchar(3) not null,
        "reference_external_transaction_id" varchar(120) null,
        "status" varchar(20) not null,
        "reference_transaction_id" uuid null,
        "failure_code" varchar(80) null,
        "created_at" timestamptz not null,
        "processed_at" timestamptz null,
        constraint "wager_transactions_pkey" primary key ("id"),
        constraint "wager_transactions_idempotency_unique" unique ("idempotency_key"),
        constraint "wager_transactions_provider_external_unique" unique ("provider_id", "external_transaction_id"),
        constraint "wager_transactions_wallet_fk" foreign key ("wallet_id") references "wallets" ("id"),
        constraint "wager_transactions_reference_fk" foreign key ("reference_transaction_id") references "wager_transactions" ("id"),
        constraint "wager_transactions_amount_non_negative" check ("amount" >= 0),
        constraint "wager_transactions_kind_check" check ("kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')),
        constraint "wager_transactions_status_check" check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'))
      );
    `);

    this.addSql(`create index "wager_transactions_wallet_id_index" on "wager_transactions" ("wallet_id");`);
    this.addSql(`create index "wager_transactions_reference_external_index" on "wager_transactions" ("provider_id", "reference_external_transaction_id");`);

    this.addSql(`
      create table "wallet_ledger_entries" (
        "id" uuid not null,
        "wallet_id" uuid not null,
        "transaction_id" uuid not null,
        "direction" varchar(10) not null,
        "amount" numeric(18, 2) not null,
        "currency" varchar(3) not null,
        "balance_before" numeric(18, 2) not null,
        "balance_after" numeric(18, 2) not null,
        "created_at" timestamptz not null,
        constraint "wallet_ledger_entries_pkey" primary key ("id"),
        constraint "wallet_ledger_entries_wallet_transaction_unique" unique ("wallet_id", "transaction_id"),
        constraint "wallet_ledger_entries_wallet_fk" foreign key ("wallet_id") references "wallets" ("id"),
        constraint "wallet_ledger_entries_transaction_fk" foreign key ("transaction_id") references "wager_transactions" ("id"),
        constraint "wallet_ledger_entries_amount_positive" check ("amount" > 0),
        constraint "wallet_ledger_entries_direction_check" check ("direction" in ('DEBIT', 'CREDIT')),
        constraint "wallet_ledger_entries_balance_non_negative" check ("balance_before" >= 0 and "balance_after" >= 0),
        constraint "wallet_ledger_entries_balanced_check" check (
          ("direction" = 'DEBIT' and "balance_before" - "amount" = "balance_after")
          or ("direction" = 'CREDIT' and "balance_before" + "amount" = "balance_after")
        )
      );
    `);

    this.addSql(`create index "wallet_ledger_entries_wallet_created_index" on "wallet_ledger_entries" ("wallet_id", "created_at");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wallet_ledger_entries";`);
    this.addSql(`drop table if exists "wager_transactions";`);
    this.addSql(`drop table if exists "wallets";`);
  }
}
