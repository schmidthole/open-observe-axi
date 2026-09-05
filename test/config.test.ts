import { describe, expect, it } from "vitest";
import { environmentFlag, readConfig } from "../src/config.js";

const baseEnv = {
  OPENOBSERVE_URL: "https://observe.example.test",
  OPENOBSERVE_EMAIL: "service@example.test",
  OPENOBSERVE_TOKEN: "placeholder-token",
};

describe("configuration", () => {
  it("reads connection values and conventional defaults from the environment", () => {
    const config = readConfig({ env: baseEnv });
    expect(config.url.href).toBe("https://observe.example.test/");
    expect(config.org).toBe("default");
    expect(config.insecure).toBe(false);
  });

  it("requires credentials without including them in flags", () => {
    expect(() => readConfig({ env: { ...baseEnv, OPENOBSERVE_TOKEN: "" } })).toThrow("OPENOBSERVE_TOKEN is not set");
    expect(environmentFlag("1")).toBe(true);
    expect(environmentFlag("false")).toBe(false);
    expect(() => environmentFlag("sometimes")).toThrow("OPENOBSERVE_INSECURE");
  });
});
