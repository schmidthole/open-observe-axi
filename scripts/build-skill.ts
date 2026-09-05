import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SKILL_GUIDE, TOP_LEVEL_HELP } from "../src/help.js";

const target = resolve("skills/open-observe-axi/SKILL.md");
const generated = `---
name: open-observe-axi
description: Search OpenObserve logs and distributed traces through an agent-ergonomic CLI.
---

# open-observe-axi

${SKILL_GUIDE}

## Top-level reference

\`\`\`text
${TOP_LEVEL_HELP.trimEnd()}
\`\`\`

When the binary is not installed globally, replace \`open-observe-axi\` with \`npx -y open-observe-axi\`.
`;

if (process.argv.includes("--check")) {
  let current = "";
  try { current = await readFile(target, "utf8"); } catch { /* reported below */ }
  if (current !== generated) {
    process.stderr.write("skills/open-observe-axi/SKILL.md is stale; run npm run build:skill\n");
    process.exitCode = 1;
  }
} else {
  await mkdir(resolve("skills/open-observe-axi"), { recursive: true });
  await writeFile(target, generated, "utf8");
}
