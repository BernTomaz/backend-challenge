import { describe, expect, test } from "bun:test";
import { MetricsController } from "../../src/http/metrics.controller";
import { incrementTransactionStatus, metrics } from "../../src/infrastructure/observability/observability";

describe("MetricsController", () => {
  test("returns observability metrics snapshot", () => {
    metrics.transactionsByStatus.clear();
    incrementTransactionStatus("PROCESSED");
    metrics.dlqMessages = 1;

    expect(new MetricsController().snapshot()).toMatchObject({
      transactionsByStatus: { PROCESSED: 1 },
      dlqMessages: 1,
    });
  });
});
