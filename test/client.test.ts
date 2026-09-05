import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { OpenObserveClient, type SearchRequest } from "../src/client.js";
import type { OpenObserveConfig } from "../src/config.js";

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function localServer(handler: http.RequestListener): Promise<{ server: http.Server; url: URL }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing server address");
  return { server, url: new URL(`http://127.0.0.1:${address.port}/`) };
}

function config(url: URL): OpenObserveConfig {
  return {
    url,
    org: "example-org",
    email: "service@example.test",
    token: "placeholder-token",
    insecure: false,
  };
}

describe("OpenObserveClient", () => {
  it("uses Basic auth and the observed stream endpoint shape", async () => {
    const { url } = await localServer((request, response) => {
      expect(request.url).toBe("/api/example-org/streams?type=logs");
      expect(request.headers.authorization).toBe(`Basic ${Buffer.from("service@example.test:placeholder-token").toString("base64")}`);
      expect(request.headers["user-agent"]).toBe("open-observe-axi/0.1.0");
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ total: 1, list: [{ name: "app", stream_type: "logs" }] }));
    });
    await expect(new OpenObserveClient({ config: config(url) }).listStreams("logs")).resolves.toMatchObject({ total: 1 });
  });

  it("posts search JSON and selects trace data with the type query", async () => {
    const { url } = await localServer((request, response) => {
      expect(request.url).toBe("/api/example-org/_search?type=traces");
      expect(request.method).toBe("POST");
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as SearchRequest;
        expect(body.query.sql).toContain("trace_id");
        expect(Buffer.concat(chunks).toString("utf8")).not.toContain("placeholder-token");
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ total: 1, hits: [{ trace_id: "0123456789abcdef" }] }));
      });
    });
    const request: SearchRequest = {
      query: { sql: "SELECT * FROM traces WHERE trace_id = '0123456789abcdef'", start_time: 1, end_time: 2, from: 0, size: 25 },
    };
    await expect(new OpenObserveClient({ config: config(url) }).search(request, "traces")).resolves.toMatchObject({ total: 1 });
  });

  it("redacts credentials from API errors", async () => {
    const { url } = await localServer((_request, response) => {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "bad placeholder-token" }));
    });
    await expect(new OpenObserveClient({ config: config(url) }).listOrganizations()).rejects.not.toThrow("placeholder-token");
  });
});
