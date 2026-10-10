import { describe, expect, test } from "bun:test";
import { IntegrationEvent } from "../../src/domain/integration-event";
import { OutboxMessage } from "../../src/domain/outbox-message";

class TestEvent extends IntegrationEvent<{ transactionId: string }> {
  readonly eventType = "WagerTransactionProcessed";
  readonly version = 1;

  static create(): TestEvent {
    return new TestEvent({
      eventId: "event-1",
      aggregateId: "wallet-1",
      correlationId: "correlation-1",
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      data: { transactionId: "transaction-1" },
    });
  }
}

const event = TestEvent.create();

describe("OutboxMessage", () => {
  test("enqueues pending message from event", () => {
    const message = OutboxMessage.enqueue(event);

    expect(message.id).toBe("event-1");
    expect(message.aggregateId).toBe("wallet-1");
    expect(message.eventType).toBe("WagerTransactionProcessed");
    expect(message.payload).toEqual(event.toJSON());
    expect(message.attempts).toBe(0);
    expect(message.isPending()).toBe(true);
    expect(message.isDue(event.occurredAt)).toBe(true);
  });

  test("marks message as published", () => {
    const message = OutboxMessage.enqueue(event);
    const publishedAt = new Date("2026-01-02T00:00:00.000Z");

    message.markPublished(publishedAt);

    expect(message.isPending()).toBe(false);
    expect(message.publishedAt).toBe(publishedAt);
    expect(message.isDue(new Date("2026-01-03T00:00:00.000Z"))).toBe(false);
  });

  test("schedules retry with exponential backoff", () => {
    const message = OutboxMessage.enqueue(event);
    const now = new Date("2026-01-01T00:00:00.000Z");

    message.scheduleRetry(now);

    expect(message.attempts).toBe(1);
    expect(message.nextAttemptAt).toEqual(new Date("2026-01-01T00:00:02.000Z"));
    expect(message.isDue(now)).toBe(false);
    expect(message.isDue(new Date("2026-01-01T00:00:02.000Z"))).toBe(true);
  });

  test("rehydrates persisted message", () => {
    const occurredAt = new Date("2026-01-01T00:00:00.000Z");
    const nextAttemptAt = new Date("2026-01-01T00:01:00.000Z");
    const message = OutboxMessage.rehydrate({
      id: "event-1",
      aggregateId: "wallet-1",
      eventType: "WagerTransactionProcessed",
      payload: event.toJSON(),
      occurredAt,
      attempts: 3,
      nextAttemptAt,
    });

    expect(message.occurredAt).toBe(occurredAt);
    expect(message.attempts).toBe(3);
    expect(message.nextAttemptAt).toBe(nextAttemptAt);
    expect(message.isPending()).toBe(true);
  });
});
