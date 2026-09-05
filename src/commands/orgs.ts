import { booleanFlag, commandHelp, parseArgs, type CommandDefinition } from "../args.js";
import { type JsonObject, type OpenObserveClient } from "../client.js";
import { compact, type OutputRecord } from "../output.js";

const DEFINITION: CommandDefinition = {
  usage: "open-observe-axi orgs",
  description: "List organizations visible to the configured service account",
  flags: { "--full": { type: "boolean", description: "Return complete organization records" } },
  examples: ["open-observe-axi orgs", "open-observe-axi orgs --full"],
};

export async function orgsCommand(args: string[], client: OpenObserveClient): Promise<OutputRecord | string> {
  if (args.length === 1 && args[0] === "--help") return commandHelp(DEFINITION);
  const parsed = parseArgs(args, DEFINITION);
  const organizations = await client.listOrganizations();
  const records = booleanFlag(parsed, "--full") ? organizations : organizations.map(compactOrganization);
  if (records.length === 0) {
    return {
      count: 0,
      organizations: "0 organizations exposed by this OpenObserve instance",
      help: ["Check OPENOBSERVE_ORG or ask an administrator which organization this account can access"],
    };
  }
  return {
    count: `${records.length} organizations`,
    configured: client.org,
    organizations: records,
    help: ["Set OPENOBSERVE_ORG=<identifier> to select an organization"],
  };
}

function compactOrganization(organization: JsonObject): OutputRecord {
  return compact({
    identifier: organization.identifier,
    name: organization.name,
    type: organization.type,
    account: organization.user_email,
  });
}
