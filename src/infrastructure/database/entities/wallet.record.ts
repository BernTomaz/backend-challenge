import { Entity, PrimaryKey, Property, Unique } from "@mikro-orm/core";

@Entity({ tableName: "wallets" })
@Unique({ properties: ["playerId", "currency"] })
export class WalletRecord {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  playerId!: string;

  @Property({ type: "varchar", length: 3 })
  currency!: string;

  @Property({ type: "decimal", precision: 18, scale: 2 })
  balanceAmount!: string;

  @Property({ type: "integer" })
  version!: number;

  @Property()
  createdAt!: Date;

  @Property({ onUpdate: () => new Date() })
  updatedAt!: Date;
}
