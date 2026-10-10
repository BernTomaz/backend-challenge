import { BadRequestException } from "@nestjs/common";
import { describe, expect, test } from "bun:test";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../src/domain/wager-transaction";
import {
  statusCodeFor,
  validateSubmitWagerTransactionBody,
} from "../../src/http/wagering.controller";

const body = {
  providerId: "provider-a",
  externalTransactionId: "transaction-1",
  playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  walletId: "0192f291-27dd-7d3f-8071-5f8685deef37",
  roundId: "round-1",
  gameId: "game-1",
  kind: WagerTransactionKind.Bet,
  money: { amount: "25.00", currency: "BRL" },
};

describe("validateSubmitWagerTransactionBody", () => {
  test("accepts valid payload", () => {
    expect(() => validateSubmitWagerTransactionBody("provider-a:transaction-1", body)).not.toThrow();
  });

  test("requires idempotency key", () => {
    expect(() => validateSubmitWagerTransactionBody(undefined, body)).toThrow(
      BadRequestException,
    );
  });

  test("rejects opening submitted through HTTP", () => {
    expect(() =>
      validateSubmitWagerTransactionBody("provider-a:transaction-1", {
        ...body,
        kind: WagerTransactionKind.Opening,
      }),
    ).toThrow(BadRequestException);
  });

  test("maps processing outcomes to distinct HTTP status codes", () => {
    expect(statusCodeFor(result(WagerTransactionStatus.Processed))).toBe(201);
    expect(statusCodeFor(result(WagerTransactionStatus.PendingReference))).toBe(202);
    expect(statusCodeFor(result(WagerTransactionStatus.Rejected))).toBe(422);
    expect(statusCodeFor(result(WagerTransactionStatus.Failed))).toBe(503);
    expect(statusCodeFor({ ...result(WagerTransactionStatus.Processed), idempotentReplay: true })).toBe(200);
  });
});

function result(status: WagerTransactionStatus) {
  return {
    transactionId: "transaction-1",
    status,
    balance: { amount: "75.00", currency: "BRL" },
    idempotentReplay: false,
  };
}
