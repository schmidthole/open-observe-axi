import { AxiError } from "axi-sdk-js";
import { booleanFlag, commandHelp, parseArgs, stringFlag, type CommandDefinition } from "../args.js";
import { type OpenObserveClient, type StreamRecord, type StreamType } from "../client.js";
import { compact, microsecondsToIso, numericValue, type OutputRecord } from "../output.js";

const DEFINITION: CommandDefinition = {
  usage: "open-observe-axi streams",
  description: "List streams available in the configured organization",
  flags: {
    "--type": { type: "string", description: "Filter by logs or traces" },
    "--full": { type: "boolean", description: "Return complete stream records" },
  },
  examples: [
    "open-observe-axi streams",
    "open-observe-axi streams --type logs",
    "open-observe-axi streams --type traces --full",
  ],
};

export async function streamsCommand(args: string[], client: OpenObserveClient): Promise<OutputRecord | string> {
  if (args.length === 1 && args[0] === "--help") return commandHelp(DEFINITION);
  const parsed = parseArgs(args, DEFINITION);
  const rawType = stringFlag(parsed, "--type");
  if (rawType !== undefined && rawType !== "logs" && rawType !== "traces") {
    throw new AxiError("--type must be logs or traces", "VALIDATION_ERROR");
  }
  const response = await client.listStreams(rawType as StreamType | undefined);
  const records = booleanFlag(parsed, "--full") ? response.list : response.list.map(compactStream);
  if (records.length === 0) {
    return {
      count: 0,
      streams: `0 ${rawType ?? "matching"} streams found in organization ${client.org}`,
      help: rawType ? ["Run `open-observe-axi streams` to list every stream"] : [],
    };
  }
  return {
    count: `${records.length} streams`,
    organization: client.org,
    streams: records,
    help: [
      "Run `open-observe-axi logs --stream <name>` to query a log stream",
      "Run `open-observe-axi traces --stream <name>` to query a trace stream",
    ],
  };
}

function compactStream(stream: StreamRecord): OutputRecord {
  const stats = typeof stream.stats === "object" && stream.stats !== null ? stream.stats as OutputRecord : {};
  return compact({
    name: stream.name,
    type: stream.stream_type,
    documents: numericValue(stats.doc_num),
    lastEvent: microsecondsToIso(stats.doc_time_max),
  });
}
