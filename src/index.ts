#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AuditLog } from "./audit.js";
import { mustLoadConfig } from "./config.js";
import { FhirClient } from "./fhir-client.js";
import {
  discoverInput,
  readInput,
  runFhirAuthStatus,
  runFhirRead,
  runFhirSearch,
  runSmartDiscover,
  searchInput,
} from "./tools.js";

async function main(): Promise<void> {
  const config = mustLoadConfig();
  const client = new FhirClient(config);
  const audit = new AuditLog(config.auditPath);
  const ctx = { client, audit };

  await client.warmupDiscovery();

  const server = new McpServer({
    name: "smart-fhir",
    version: "1.0.0",
  });

  server.registerTool(
    "smart_discover",
    {
      title: "SMART discover",
      description:
        "GET {iss}/.well-known/smart-configuration (SMART App Launch 2.2.0). Optional iss must be v1-allowlisted. Does not invent endpoints.",
      inputSchema: discoverInput,
    },
    async (args) => runSmartDiscover(args, ctx),
  );

  server.registerTool(
    "fhir_auth_status",
    {
      title: "FHIR auth status",
      description:
        "Report mode, ISS, R4 lock, write=off, token_present, discovery_ok. Never prints token or PEM.",
    },
    async () => runFhirAuthStatus({}, ctx),
  );

  server.registerTool(
    "fhir_search",
    {
      title: "FHIR search",
      description:
        "GET {iss}/{resourceType} as FHIR R4 searchset. resourceType allowlist: Patient, Observation, Condition, MedicationRequest, Encounter. _count default 10 max 50. One page only. Does not invent Patients.",
      inputSchema: searchInput,
    },
    async (args) => runFhirSearch(args, ctx),
  );

  server.registerTool(
    "fhir_read",
    {
      title: "FHIR read",
      description:
        "GET {iss}/{resourceType}/{id} as FHIR R4. 404 is not found, not a made-up resource. Same resourceType allowlist as search.",
      inputSchema: readInput,
    },
    async (args) => runFhirRead(args, ctx),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("smart-fhir-mcp v1 stdio (FHIR R4 4.0.1, SMART 2.2.0, writes off)");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
