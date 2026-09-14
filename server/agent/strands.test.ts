import { describe, expect, it, vi } from "vitest";
import { StrandsEngine } from "./strands";

/**
 * The Strands engine needs a configured model provider. Without one, its
 * constructor must fail with an actionable message and engine selection must
 * fall back to the deterministic engine — the app stays fully functional.
 * (The test setup pins AGENT_PROVIDER=deterministic and clears provider
 * credentials.)
 */
describe("Strands engine configuration", () => {
  it("throws an actionable error when no model provider is configured", () => {
    expect(() => new StrandsEngine()).toThrow(/requires/i);
  });

  it("engine selection falls back to deterministic when Strands is unconfigured", async () => {
    process.env.AGENT_PROVIDER = "strands";
    try {
      vi.resetModules();
      const { getExtractionEngine } = await import("./engine");
      const engine = await getExtractionEngine();
      expect(engine.name).toBe("deterministic");
      expect(engine.modelId).toBeNull();
    } finally {
      delete process.env.AGENT_PROVIDER;
      vi.resetModules();
    }
  });
});
