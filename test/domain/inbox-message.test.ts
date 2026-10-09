import { describe, expect, test } from "bun:test";
import { InboxMessage } from "../../src/domain/inbox-message";

describe("InboxMessage", () => {
  test("receives unprocessed message", () => {
    const receivedAt = new Date("2026-01-01T00:00:00.000Z");
    const message = InboxMessage.receive({
      messageId: "message-1",
      consumerName: "wager-consumer",
      payloadHash: "payload-hash",
      receivedAt,
    });

    expect(message.messageId).toBe("message-1");
    expect(message.consumerName).toBe("wager-consumer");
    expect(message.payloadHash).toBe("payload-hash");
    expect(message.receivedAt).toBe(receivedAt);
    expect(message.isProcessed()).toBe(false);
  });

  test("marks message as processed", () => {
    const message = InboxMessage.receive({
      messageId: "message-1",
      consumerName: "wager-consumer",
      payloadHash: "payload-hash",
    });
    const processedAt = new Date("2026-01-02T00:00:00.000Z");

    message.markProcessed(processedAt);

    expect(message.isProcessed()).toBe(true);
    expect(message.processedAt).toBe(processedAt);
  });

  test("rehydrates persisted message", () => {
    const receivedAt = new Date("2026-01-01T00:00:00.000Z");
    const processedAt = new Date("2026-01-02T00:00:00.000Z");
    const message = InboxMessage.rehydrate({
      messageId: "message-1",
      consumerName: "wager-consumer",
      payloadHash: "payload-hash",
      receivedAt,
      processedAt,
    });

    expect(message.receivedAt).toBe(receivedAt);
    expect(message.processedAt).toBe(processedAt);
    expect(message.isProcessed()).toBe(true);
  });
});
