import { describe, expect, test } from "bun:test";
import { BadRequestException } from "@nestjs/common";
import { validateCreateWalletBody } from "../../src/http/wallets.controller";

describe("validateCreateWalletBody", () => {
  test("accepts valid wallet payload", () => {
    expect(() =>
      validateCreateWalletBody({
        playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
        initialBalance: { amount: "100.00", currency: "BRL" },
      }),
    ).not.toThrow();
  });

  test("rejects missing playerId", () => {
    expect(() =>
      validateCreateWalletBody({
        playerId: "",
        initialBalance: { amount: "100.00", currency: "BRL" },
      }),
    ).toThrow(BadRequestException);
  });

  test("rejects invalid initial balance", () => {
    expect(() =>
      validateCreateWalletBody({
        playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
        initialBalance: { amount: "100.001", currency: "BRL" },
      }),
    ).toThrow(BadRequestException);
  });
});
