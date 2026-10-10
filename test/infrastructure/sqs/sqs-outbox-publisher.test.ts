import { describe, expect, test } from "bun:test";
import { SqsOutboxPublisher } from "../../../src/infrastructure/sqs/sqs-outbox-publisher";

describe("SqsOutboxPublisher", () => {
  test("publishes event envelope to FIFO queue", async () => {
    const sent: Array<{ input: Record<string, unknown> }> = [];
    const publisher = new SqsOutboxPublisher({
      send: async (command: { input: Record<string, unknown> }) => {
        sent.push(command);
        return {};
      },
    }, "queue-url");
    const payload = {
      eventId: "event-1",
      aggregateId: "wallet-1",
      eventType: "WagerTransactionProcessed",
      version: 1,
      data: { transactionId: "transaction-1" },
    };

    await publisher.publish(payload);

    expect(sent[0]?.input).toMatchObject({
      QueueUrl: "queue-url",
      MessageBody: JSON.stringify(payload),
      MessageGroupId: "wallet-1",
      MessageDeduplicationId: "event-1",
    });
  });
});
