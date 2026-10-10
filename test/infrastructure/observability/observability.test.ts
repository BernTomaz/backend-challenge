import { describe, expect, spyOn, test } from "bun:test";
import {
  incrementTransactionStatus,
  logInfo,
  metrics,
  metricsSnapshot,
} from "../../../src/infrastructure/observability/observability";

describe("observability", () => {
  test("writes structured JSON logs with correlation fields", () => {
    const info = spyOn(console, "info").mockImplementation(() => undefined);

    logInfo("wager_transaction_processed", {
      correlationId: "provider-a:transaction-1",
      messageId: "msg-1",
      transactionId: "transaction-1",
      walletId: "wallet-1",
      providerId: "provider-a",
    });

    const logged = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(logged).toMatchObject({
      level: "info",
      message: "wager_transaction_processed",
      correlationId: "provider-a:transaction-1",
      messageId: "msg-1",
      transactionId: "transaction-1",
      walletId: "wallet-1",
      providerId: "provider-a",
    });
    info.mockRestore();
  });

  test("keeps required metric counters available", () => {
    expect(metrics.transactionsByStatus).toBeInstanceOf(Map);
    expect(metrics).toHaveProperty("duplicatesDetected");
    expect(metrics).toHaveProperty("retries");
    expect(metrics).toHaveProperty("dlqMessages");
    expect(metrics).toHaveProperty("lockConflicts");
    expect(metrics).toHaveProperty("outboxLagMs");
    expect(metrics).toHaveProperty("processingLatencyMs");
  });

  test("exports metrics as plain JSON snapshot", () => {
    metrics.transactionsByStatus.clear();
    incrementTransactionStatus("PROCESSED");
    metrics.duplicatesDetected = 1;

    expect(metricsSnapshot()).toMatchObject({
      transactionsByStatus: { PROCESSED: 1 },
      duplicatesDetected: 1,
      retries: expect.any(Number),
      dlqMessages: expect.any(Number),
      lockConflicts: expect.any(Number),
      outboxLagMs: expect.any(Number),
      processingLatencyMs: expect.any(Number),
    });
  });
});
