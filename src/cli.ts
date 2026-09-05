import { homedir } from "node:os";
import { AxiError, exitCodeForError, runAxiCli } from "axi-sdk-js";
import { OpenObserveClient } from "./client.js";
import { logsCommand } from "./commands/logs.js";
import { orgsCommand } from "./commands/orgs.js";
import { setupCommand } from "./commands/setup.js";
import { streamsCommand } from "./commands/streams.js";
import { tracesCommand } from "./commands/traces.js";
import { TOP_LEVEL_HELP } from "./help.js";
import { VERSION } from "./version.js";

type AxiRenderable = string | Record<string, unknown>;
type Handler = (args: string[], client: OpenObserveClient) => Promise<AxiRenderable>;
const DESCRIPTION = "Query OpenObserve logs and distributed traces for agent-driven debugging";

export async function main(): Promise<void> {
  const originalArgv = process.argv.slice(2);
  const jsonMode = originalArgv.includes("--json");
  const insecure = originalArgv.includes("--insecure");
  const argv = originalArgv.filter((arg) => arg !== "--json" && arg !== "--insecure");
  if (jsonMode && argv.length === 0) {
    await writeJsonHome(insecure);
    return;
  }
  const wrap = (handler: Handler) => async (args: string[]): Promise<AxiRenderable> => {
    const output = await handler(args, new OpenObserveClient({ insecure }));
    return jsonMode && typeof output !== "string" ? JSON.stringify(output, null, 2) : output;
  };

  await runAxiCli({
    description: DESCRIPTION,
    version: VERSION,
    packageName: "open-observe-axi",
    argv,
    topLevelHelp: TOP_LEVEL_HELP,
    home: async () => {
      const output = await logsCommand([], new OpenObserveClient({ insecure }));
      return jsonMode && typeof output !== "string" ? JSON.stringify(output, null, 2) : output;
    },
    commands: {
      logs: wrap(logsCommand),
      traces: wrap(tracesCommand),
      streams: wrap(streamsCommand),
      orgs: wrap(orgsCommand),
      setup: async (args) => {
        const output = await setupCommand(args);
        return jsonMode && typeof output !== "string" ? JSON.stringify(output, null, 2) : output;
      },
    },
    formatError: (error) => formatError(error, jsonMode),
    renderUnknownCommand: (command) => jsonMode
      ? `${JSON.stringify({ error: `Unknown command: ${command}`, code: "VALIDATION_ERROR", help: ["Run `open-observe-axi --help`"] }, null, 2)}\n`
      : `error: Unknown command: ${command}\ncode: VALIDATION_ERROR\nhelp[1]: Run \`open-observe-axi --help\`\n`,
  });
}

async function writeJsonHome(insecure: boolean): Promise<void> {
  try {
    const output = await logsCommand([], new OpenObserveClient({ insecure }));
    if (typeof output === "string") throw new AxiError("Home view returned an unexpected response", "UNKNOWN");
    process.stdout.write(`${JSON.stringify({ bin: collapseHome(process.argv[1] ?? ""), description: DESCRIPTION, ...output }, null, 2)}\n`);
  } catch (error) {
    const formatted = formatError(error, true);
    process.stdout.write(formatted.output);
    process.exitCode = formatted.exitCode;
  }
}

function collapseHome(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function formatError(error: unknown, jsonMode: boolean): { output: string; exitCode: number } {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof AxiError ? error.code : "UNKNOWN";
  const help = error instanceof AxiError ? error.suggestions : [];
  const exitCode = exitCodeForError(error);
  if (jsonMode) {
    return {
      output: `${JSON.stringify({ error: message, code, ...(help.length ? { help } : {}) }, null, 2)}\n`,
      exitCode,
    };
  }
  const lines = [`error: ${message}`, `code: ${code}`];
  if (help.length) lines.push(`help[${help.length}]:`, ...help.map((item) => `  ${item}`));
  return { output: `${lines.join("\n")}\n`, exitCode };
}
