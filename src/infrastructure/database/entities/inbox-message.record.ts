import { Entity, PrimaryKey, Property, Unique } from "@mikro-orm/core";

@Entity({ tableName: "inbox_messages" })
@Unique({ properties: ["consumerName", "messageId"] })
export class InboxMessageRecord {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "varchar", length: 120 })
  messageId!: string;

  @Property({ type: "varchar", length: 80 })
  consumerName!: string;

  @Property({ type: "char", length: 64 })
  payloadHash!: string;

  @Property()
  receivedAt!: Date;

  @Property({ nullable: true })
  processedAt?: Date;
}
