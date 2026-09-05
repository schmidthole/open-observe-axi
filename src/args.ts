import { AxiError } from "axi-sdk-js";

export type FlagType = "boolean" | "string" | "integer";

export interface FlagDefinition {
  type: FlagType;
  required?: boolean;
  default?: string | number | boolean;
  description: string;
}

export interface PositionalDefinition {
  name: string;
  required?: boolean;
}

export interface CommandDefinition {
  usage: string;
  description: string;
  flags?: Record<string, FlagDefinition>;
  positionals?: PositionalDefinition[];
  examples?: string[];
}

export interface ParsedArgs {
  flags: Record<string, string | number | boolean>;
  positionals: string[];
}

function validation(message: string, definition: CommandDefinition): never {
  throw new AxiError(message, "VALIDATION_ERROR", [
    `Run \`${definition.usage} --help\` for the command reference`,
  ]);
}

export function commandHelp(definition: CommandDefinition): string {
  const lines = [`usage: ${definition.usage}`, `description: ${definition.description}`];
  const positionals = definition.positionals ?? [];
  if (positionals.length > 0) {
    lines.push("arguments:");
    for (const positional of positionals) {
      lines.push(`  ${positional.name}${positional.required ? " (required)" : ""}`);
    }
  }
  const entries = Object.entries(definition.flags ?? {});
  if (entries.length > 0) {
    lines.push("flags:");
    for (const [name, flag] of entries) {
      const value = flag.type === "boolean" ? "" : ` <${flag.type === "integer" ? "n" : "value"}>`;
      const qualifiers = [
        flag.required ? "required" : "",
        flag.default !== undefined ? `default ${String(flag.default)}` : "",
      ].filter(Boolean);
      lines.push(`  ${name}${value}${qualifiers.length ? ` (${qualifiers.join(", ")})` : ""}: ${flag.description}`);
    }
  }
  lines.push("  --help: Show this command reference");
  const examples = definition.examples ?? [];
  if (examples.length > 0) lines.push("examples:", ...examples.map((example) => `  ${example}`));
  return `${lines.join("\n")}\n`;
}

export function parseArgs(args: string[], definition: CommandDefinition): ParsedArgs {
  const flagDefinitions = definition.flags ?? {};
  const flags: Record<string, string | number | boolean> = {};
  const positionals: string[] = [];

  for (const [name, flag] of Object.entries(flagDefinitions)) {
    if (flag.default !== undefined) flags[name] = flag.default;
  }

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) continue;
    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }
    if (token === "--help") validation("--help must be used by itself for this command", definition);
    if (!token.startsWith("--")) validation(`Unknown flag: ${token}`, definition);

    const equalsIndex = token.indexOf("=");
    const name = equalsIndex === -1 ? token : token.slice(0, equalsIndex);
    const flag = flagDefinitions[name];
    if (!flag) {
      const valid = Object.keys(flagDefinitions);
      validation(
        `Unknown flag ${name}.${valid.length ? ` Valid flags: ${valid.join(", ")}` : " This command takes no flags."}`,
        definition,
      );
    }

    let value: string | number | boolean;
    if (flag.type === "boolean") {
      if (equalsIndex !== -1) validation(`${name} does not take a value`, definition);
      value = true;
    } else {
      const raw = equalsIndex === -1 ? args[index + 1] : token.slice(equalsIndex + 1);
      if (raw === undefined || (equalsIndex === -1 && raw.startsWith("--")) || raw.trim() === "") {
        validation(`${name} requires a value`, definition);
      }
      if (equalsIndex === -1) index += 1;
      if (flag.type === "integer") {
        if (!/^\d+$/.test(raw)) validation(`${name} must be a non-negative integer`, definition);
        value = Number(raw);
        if (!Number.isSafeInteger(value)) validation(`${name} is outside the supported integer range`, definition);
      } else {
        value = raw;
      }
    }

    if (flags[name] !== undefined && flag.default === undefined) {
      validation(`${name} may only be provided once`, definition);
    }
    flags[name] = value;
  }

  const positionalDefinitions = definition.positionals ?? [];
  const requiredCount = positionalDefinitions.filter((item) => item.required).length;
  if (positionals.length < requiredCount) {
    validation(`Missing required argument: ${positionalDefinitions[positionals.length]?.name ?? "argument"}`, definition);
  }
  if (positionals.length > positionalDefinitions.length) {
    validation(`Unexpected argument: ${positionals[positionalDefinitions.length]}`, definition);
  }
  for (const [name, flag] of Object.entries(flagDefinitions)) {
    if (flag.required && flags[name] === undefined) validation(`${name} is required`, definition);
  }
  return { flags, positionals };
}

export function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
}

export function integerFlag(parsed: ParsedArgs, name: string): number | undefined {
  const value = parsed.flags[name];
  return typeof value === "number" ? value : undefined;
}

export function booleanFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags[name] === true;
}

export function boundedLimit(parsed: ParsedArgs, defaultValue = 25): number {
  const limit = integerFlag(parsed, "--limit") ?? defaultValue;
  if (limit < 1 || limit > 250) throw new AxiError("--limit must be between 1 and 250", "VALIDATION_ERROR");
  return limit;
}
