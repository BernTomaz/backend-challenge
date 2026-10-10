import { Entity, Index, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ tableName: "outbox_messages" })
@Index({ properties: ["publishedAt", "nextAttemptAt"] })
export class OutboxMessageRecord {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  aggregateId!: string;

  @Property({ type: "varchar", length: 120 })
  eventType!: string;

  @Property({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @Property()
  occurredAt!: Date;

  @Property({ type: "integer" })
  attempts!: number;

  @Property({ nullable: true })
  nextAttemptAt?: Date;

  @Property({ nullable: true })
  publishedAt?: Date;
}
