import { describe, expect, test } from "bun:test";
import { HealthController } from "../../src/http/health.controller";

describe("HealthController", () => {
  test("returns live status", () => {
    const controller = new HealthController({} as never);

    expect(controller.live()).toEqual({ status: "ok" });
  });
});
