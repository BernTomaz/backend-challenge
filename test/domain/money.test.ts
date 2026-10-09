import { describe, expect, test } from "bun:test";
import { Money } from "../../src/domain/money";

describe("Money", () => {
  test("serializes with fixed decimal scale", () => {
    expect(Money.from({ amount: "25.00", currency: "brl" }).toJSON()).toEqual({
      amount: "25.00",
      currency: "BRL",
    });
  });

  test("adds, subtracts and negates without using floating point", () => {
    const ten = Money.from({ amount: "10.10", currency: "BRL" });
    const five = Money.from({ amount: "5.05", currency: "BRL" });

    expect(ten.add(five).toJSON().amount).toBe("15.15");
    expect(ten.subtract(five).toJSON().amount).toBe("5.05");
    expect(five.negate().toJSON().amount).toBe("-5.05");
  });

  test("rejects invalid input amounts", () => {
    expect(() => Money.from({ amount: "", currency: "BRL" })).toThrow();
    expect(() => Money.from({ amount: "NaN", currency: "BRL" })).toThrow();
    expect(() => Money.from({ amount: "Infinity", currency: "BRL" })).toThrow();
    expect(() => Money.from({ amount: "1e2", currency: "BRL" })).toThrow();
    expect(() => Money.from({ amount: "1.001", currency: "BRL" })).toThrow();
    expect(() => Money.from({ amount: "-1.00", currency: "BRL" })).toThrow();
  });

  test("rejects operations between different currencies", () => {
    const brl = Money.from({ amount: "1.00", currency: "BRL" });
    const usd = Money.from({ amount: "1.00", currency: "USD" });

    expect(() => brl.add(usd)).toThrow("Currency mismatch");
    expect(() => brl.subtract(usd)).toThrow("Currency mismatch");
    expect(() => brl.isLessThan(usd)).toThrow("Currency mismatch");
  });
});
