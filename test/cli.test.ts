import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

const bin = "dist/bin/open-observe-axi.js";

function run(args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      OPENOBSERVE_URL: "",
      OPENOBSERVE_ORG: "",
      OPENOBSERVE_EMAIL: "",
      OPENOBSERVE_TOKEN: "",
    },
  });
}

describe("CLI contract", () => {
  it("prints a bare version for every version alias", () => {
    for (const flag of ["-v", "-V", "--version"]) {
      const result = run([flag]);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("0.1.0\n");
    }
  });

  it("shows concise self-describing help at each command layer", () => {
    expect(run(["--help"]).stdout).toContain("commands[5]");
    expect(run(["logs", "--help"]).stdout).toContain("--sql");
    expect(run(["traces", "get", "--help"]).stdout).toContain("trace-id");
    expect(run(["setup", "--help"]).stdout).toContain("hooks");
  });

  it("validates usage before authentication and emits JSON errors on request", () => {
    const missing = run(["traces", "get", "--json"]);
    expect(missing.status).toBe(2);
    expect(JSON.parse(missing.stdout)).toMatchObject({ code: "VALIDATION_ERROR", error: "Missing required argument: trace-id" });
    const unknown = run(["logs", "--stat", "open"]);
    expect(unknown.status).toBe(2);
    expect(unknown.stdout).toContain("Unknown flag --stat");
    const unknownSetup = run(["setup", "unknown", "--help"]);
    expect(unknownSetup.status).toBe(2);
    expect(unknownSetup.stdout).toContain("Unknown setup action");
  });

  it("emits valid JSON for the successful content-first home view", async () => {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      if (request.url === "/api/example-org/streams?type=logs") {
        response.end(JSON.stringify({ total: 1, list: [{ name: "app_logs", stream_type: "logs" }] }));
        return;
      }
      if (request.url === "/api/example-org/_search?type=logs") {
        response.end(JSON.stringify({ total: 1, hits: [{ _timestamp: 1_788_566_400_000_000, body: "ok" }] }));
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing server address");
    const child = spawn(process.execPath, [bin, "--json"], {
      env: {
        ...process.env,
        OPENOBSERVE_URL: `http://127.0.0.1:${address.port}`,
        OPENOBSERVE_ORG: "example-org",
        OPENOBSERVE_EMAIL: "service@example.test",
        OPENOBSERVE_TOKEN: "placeholder-token",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const status = await new Promise<number | null>((resolve) => child.on("close", resolve));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({ description: expect.any(String), count: "1 log results", results: [{ message: "ok" }] });
  });

  it("keeps the version fast path close to the node process floor", () => {
    const measure = (argv: string[]) => {
      const start = performance.now();
      const result = spawnSync(process.execPath, argv, { encoding: "utf8" });
      expect(result.status).toBe(0);
      return performance.now() - start;
    };
    const floor = Math.min(...Array.from({ length: 3 }, () => measure(["-e", "console.log(1)"])));
    const version = Math.min(...Array.from({ length: 3 }, () => measure([bin, "--version"])));
    expect(version).toBeLessThan(floor * 4 + 25);
  });
});
