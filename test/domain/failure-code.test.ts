import { describe, expect, test } from "bun:test";
import { FailureCode } from "../../src/domain/failure-code";

describe("FailureCode", () => {
  test("uses stable machine-readable values", () => {
    expect(Object.values(FailureCode).map(String)).toEqual([
      "INSUFFICIENT_BALANCE",
      "MISSING_REFERENCE",
      "REFERENCE_NOT_FOUND",
      "INVALID_REFERENCE",
      "DUPLICATE_REVERSAL",
      "ROLLBACK_WOULD_MAKE_BALANCE_NEGATIVE",
      "INFRASTRUCTURE_FAILURE",
    ]);
  });
});
