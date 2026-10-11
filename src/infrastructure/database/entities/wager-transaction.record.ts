import { Entity, Index, PrimaryKey, Property, Unique } from "@mikro-orm/core";
import { FailureCode } from "../../../domain/failure-code";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../../domain/wager-transaction";

@Entity({ tableName: "wager_transactions" })
@Unique({ properties: ["idempotencyKey"] })
@Unique({ properties: ["providerId", "externalTransactionId"] })
@Index({ properties: ["walletId"] })
@Index({ properties: ["providerId", "referenceExternalTransactionId"] })
export class WagerTransactionRecord {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "varchar", length: 80 })
  providerId!: string;

  @Property({ type: "varchar", length: 120 })
  externalTransactionId!: string;

  @Property({ type: "varchar", length: 180 })
  idempotencyKey!: string;

  @Property({ type: "char", length: 64 })
  payloadHash!: string;

  @Property({ type: "uuid" })
  walletId!: string;

  @Property({ type: "uuid" })
  playerId!: string;

  @Property({ type: "varchar", length: 120 })
  roundId!: string;

  @Property({ type: "varchar", length: 120 })
  gameId!: string;

  @Property({ type: "varchar", length: 20 })
  kind!: WagerTransactionKind;

  @Property({ type: "decimal", precision: 18, scale: 2 })
  amount!: string;

  @Property({ type: "varchar", length: 3 })
  currency!: string;

  @Property({ type: "varchar", length: 120, nullable: true })
  referenceExternalTransactionId?: string;

  @Property({ type: "varchar", length: 20 })
  status!: WagerTransactionStatus;

  @Property({ type: "uuid", nullable: true })
  referenceTransactionId?: string;

  @Property({ type: "varchar", length: 80, nullable: true })
  failureCode?: FailureCode;

  @Property({ type: "decimal", precision: 18, scale: 2, nullable: true })
  observedBalanceAmount?: string;

  @Property({ type: "varchar", length: 3, nullable: true })
  observedBalanceCurrency?: string;

  @Property()
  createdAt!: Date;

  @Property({ nullable: true })
  processedAt?: Date;

  @Property({ type: "integer" })
  referenceLookupAttempts = 0;

  @Property({ nullable: true })
  nextReferenceLookupAt?: Date;
}
