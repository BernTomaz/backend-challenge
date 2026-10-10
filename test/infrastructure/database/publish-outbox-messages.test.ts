import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import config from "../../../src/infrastructure/database/mikro-orm.config";
import { OutboxMessageRecord } from "../../../src/infrastructure/database/entities/outbox-message.record";
import {
  OutboxPublisher,
  publishDueOutboxMessages,
} from "../../../src/infrastructure/database/publish-outbox-messages";

let orm: MikroORM;

describe("publishDueOutboxMessages", () => {
  beforeAll(async () => {
    orm = await MikroORM.init(config);
    await orm.getMigrator().up();
  });

  beforeEach(async () => {
    await orm.em.fork().nativeDelete(OutboxMessageRecord, {});
  });

  afterAll(async () => {
    await orm.getMigrator().down();
    await orm.close(true);
  });

  test("publishes due messages and marks them as published", async () => {
    const message = outboxRecord("WagerTransactionProcessed");
    await orm.em.fork().persistAndFlush(message);
    const published: Record<string, unknown>[] = [];

    const count = await publishDueOutboxMessages({
      em: orm.em.fork(),
      publisher: { publish: async (payload) => { published.push(payload); } },
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    const stored = await orm.em.fork().findOneOrFail(OutboxMessageRecord, { id: message.id });
    expect(count).toBe(1);
    expect(published).toHaveLength(1);
    expect(stored.publishedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  test("schedules retry when publishing fails", async () => {
    const message = outboxRecord("WagerTransactionRejected");
    await orm.em.fork().persistAndFlush(message);

    const count = await publishDueOutboxMessages({
      em: orm.em.fork(),
      publisher: { publish: async () => { throw new Error("broker unavailable"); } },
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    const stored = await orm.em.fork().findOneOrFail(OutboxMessageRecord, { id: message.id });
    expect(count).toBe(0);
    expect(stored.attempts).toBe(1);
    expect(stored.nextAttemptAt).toEqual(new Date("2026-01-01T00:00:02.000Z"));
    expect(stored.publishedAt ?? undefined).toBeUndefined();
  });

  test("does not publish same message twice with concurrent publishers", async () => {
    const messages = [
      outboxRecord("WagerTransactionProcessed"),
      outboxRecord("WalletBalanceChanged"),
    ];
    await orm.em.fork().persistAndFlush(messages);
    const publishedIds: unknown[] = [];
    const publisher: OutboxPublisher = {
      publish: async (payload) => {
        publishedIds.push(payload.eventId);
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
    };

    const [first, second] = await Promise.all([
      publishDueOutboxMessages({ em: orm.em.fork(), publisher, limit: 2 }),
      publishDueOutboxMessages({ em: orm.em.fork(), publisher, limit: 2 }),
    ]);

    expect(first + second).toBe(2);
    expect(new Set(publishedIds).size).toBe(2);
  });
});

function outboxRecord(eventType: string): OutboxMessageRecord {
  const id = randomUUID();

  return Object.assign(new OutboxMessageRecord(), {
    id,
    aggregateId: randomUUID(),
    eventType,
    payload: {
      eventId: id,
      eventType,
      aggregateId: randomUUID(),
      correlationId: randomUUID(),
      occurredAt: "2026-01-01T00:00:00.000Z",
      version: 1,
      data: { transactionId: randomUUID() },
    },
    occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    attempts: 0,
  });
}
