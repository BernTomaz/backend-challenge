import { describe, expect, test } from "bun:test";
import { hashBusinessPayload } from "../../src/application/payload-hash";

describe("hashBusinessPayload", () => {
  test("is stable for object key order", () => {
    expect(hashBusinessPayload({ b: 1, a: { d: 2, c: 3 } })).toBe(
      hashBusinessPayload({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });
});
