import { describe, expect, it } from "vitest";
import { AxiError } from "axi-sdk-js";
import { parseArgs, type CommandDefinition } from "../src/args.js";

const definition: CommandDefinition = {
  usage: "open-observe-axi example <name>",
  description: "test command",
  positionals: [{ name: "name", required: true }],
  flags: {
    "--limit": { type: "integer", description: "limit" },
    "--full": { type: "boolean", description: "full" },
  },
};

describe("parseArgs", () => {
  it("supports equals values, flags, and positionals", () => {
    expect(parseArgs(["item", "--limit=25", "--full"], definition)).toEqual({
      positionals: ["item"],
      flags: { "--limit": 25, "--full": true },
    });
  });

  it("rejects unknown flags with a usage error", () => {
    expect(() => parseArgs(["item", "--stat", "open"], definition)).toThrowError(AxiError);
    try { parseArgs(["item", "--stat", "open"], definition); } catch (error) {
      expect((error as AxiError).code).toBe("VALIDATION_ERROR");
      expect((error as AxiError).message).toContain("Unknown flag --stat");
    }
  });

  it("rejects missing required positionals and duplicate flags", () => {
    expect(() => parseArgs([], definition)).toThrow("Missing required argument: name");
    expect(() => parseArgs(["item", "--limit", "1", "--limit", "2"], definition)).toThrow("may only be provided once");
  });
});
