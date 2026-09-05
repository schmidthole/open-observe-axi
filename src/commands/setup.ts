import { AxiError, installSessionStartHooks, sessionStartHookStatus, uninstallSessionStartHooks } from "axi-sdk-js";
import { commandHelp, parseArgs, stringFlag, type CommandDefinition } from "../args.js";
import type { OutputRecord } from "../output.js";

const GROUP_HELP = `usage: open-observe-axi setup <hooks|status|remove> [--scope user|project]
subcommands[3]:
  hooks   Install or repair SessionStart integration for Claude Code, Codex, and OpenCode
  status  Inspect integration status without writing
  remove  Remove only hooks managed by open-observe-axi
flags:
  --scope <user|project>  Installation scope (default user)
examples:
  open-observe-axi setup hooks
  open-observe-axi setup hooks --scope project
  open-observe-axi setup status
`;

export async function setupCommand(args: string[]): Promise<OutputRecord | string> {
  const action = args[0];
  if (!action || (args.length === 1 && action === "--help")) return GROUP_HELP;
  if (action !== "hooks" && action !== "status" && action !== "remove") {
    throw new AxiError(`Unknown setup action: ${action}`, "VALIDATION_ERROR", ["Use hooks, status, or remove"]);
  }
  const definition = setupDefinition(action);
  if (args.length === 2 && args[1] === "--help") return commandHelp(definition);
  const parsed = parseArgs(args.slice(1), definition);
  const rawScope = stringFlag(parsed, "--scope") ?? "user";
  if (rawScope !== "user" && rawScope !== "project") throw new AxiError("--scope must be user or project", "VALIDATION_ERROR");
  const options: { marker: string; binaryNames: string[]; scope: "user" | "project" } = {
    marker: "open-observe-axi",
    binaryNames: ["open-observe-axi"],
    scope: rawScope,
  };
  if (action === "hooks") {
    await installSessionStartHooks(options);
    return { setup: "hooks installed or already up to date", scope: rawScope, status: sessionStartHookStatus(options) };
  }
  if (action === "status") return { setup: "hook status", scope: rawScope, status: sessionStartHookStatus(options) };
  if (action === "remove") {
    await uninstallSessionStartHooks(options);
    return { setup: "managed hooks removed", scope: rawScope, status: sessionStartHookStatus(options) };
  }
  throw new AxiError(`Unknown setup action: ${action}`, "VALIDATION_ERROR", ["Use hooks, status, or remove"]);
}

function setupDefinition(action: string): CommandDefinition {
  return {
    usage: `open-observe-axi setup ${action}`,
    description: `${action} open-observe-axi session hooks`,
    flags: { "--scope": { type: "string", description: "user or project (default user)" } },
  };
}
