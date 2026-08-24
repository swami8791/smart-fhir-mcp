#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const HOME = "/workspace/smart-fhir-mcp";
const DIST = HOME + "/dist/index.js";
const DEFAULT_ISS = "https://launch.smarthealthit.org/v/r4/fhir";
const FALLBACKS = [
  "https://r4.smarthealthit.org",
  "https://hapi.fhir.org/baseR4",
];

function banner(title) {
  console.log("\n" + "=".repeat(72) + "\n" + title + "\n" + "=".repeat(72));
}

function truncate(value, max = 4000) {
  const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return s.length <= max ? s : s.slice(0, max) + "\n… truncated " + (s.length - max) + " chars";
}

class StdioMcp {
  constructor(env) {
    this.env = env;
    this.proc = null;
    this.buf = "";
    this.pending = new Map();
    this.stderr = "";
    this.nextId = 1;
  }

  start() {
    this.proc = spawn(process.execPath, [DIST], {
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this._onStdout(chunk));
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.proc.on("exit", (code) => {
      for (const [, rec] of this.pending) {
        rec.reject(new Error("server exited " + code + ": " + this.stderr.slice(-500)));
      }
      this.pending.clear();
    });
  }

  _onStdout(chunk) {
    this.buf += chunk;
    let idx;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      let line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;
      if (line.startsWith("Content-Length:")) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const rec = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          rec.resolve(msg);
        }
      } catch {
        /* ignore */
      }
    }
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("timeout waiting for " + method));
      }, 25000);
      this.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(t);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(t);
          reject(err);
        },
      });
      this.proc.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  notify(method, params) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async initialize() {
    const res = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smart-fhir-prove", version: "1.0.0" },
    });
    this.notify("notifications/initialized", {});
    return res;
  }

  async callTool(name, args = {}) {
    return this.request("tools/call", { name, arguments: args });
  }

  async close() {
    try { this.proc.stdin.end(); } catch { /* ignore */ }
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        this.proc.kill("SIGTERM");
        resolve();
      }, 2000);
      this.proc.on("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}

function toolText(rpc) {
  const content = rpc && rpc.result && rpc.result.content;
  if (Array.isArray(content)) {
    const text = content.map((c) => c.text || "").join("\n");
    try { return JSON.parse(text); } catch { return text; }
  }
  if (rpc && rpc.error) return rpc.error;
  return rpc;
}

function isAuthFail(obj) {
  return obj && typeof obj === "object" && obj.ok === false;
}

async function runSuite(label, env) {
  banner("STDIO SUITE: " + label + " ISS=" + env.FHIR_ISS);
  const mcp = new StdioMcp(env);
  mcp.start();
  const init = await mcp.initialize();
  console.log("initialize result:");
  console.log(truncate(init.result || init, 1500));

  const listed = await mcp.request("tools/list", {});
  console.log("\n--- tools/list (actual) ---");
  console.log(JSON.stringify(listed, null, 2));

  const out = { listed, calls: {} };

  out.calls.smart_discover = toolText(await mcp.callTool("smart_discover", {}));
  console.log("\n--- smart_discover ---");
  console.log(truncate(out.calls.smart_discover, 2500));

  out.calls.fhir_auth_status = toolText(await mcp.callTool("fhir_auth_status", {}));
  console.log("\n--- fhir_auth_status ---");
  console.log(truncate(out.calls.fhir_auth_status, 1500));

  out.calls.patient_search = toolText(await mcp.callTool("fhir_search", {
    resourceType: "Patient",
    params: { _count: "1" },
  }));
  console.log("\n--- fhir_search Patient _count=1 ---");
  console.log(truncate(out.calls.patient_search, 3500));

  const bundle = out.calls.patient_search;
  if (bundle && bundle.resourceType === "Bundle" && Array.isArray(bundle.entry) && bundle.entry[0]) {
    const firstId = bundle.entry[0].resource && bundle.entry[0].resource.id
      ? bundle.entry[0].resource.id
      : bundle.entry[0].id;
    const rt = bundle.entry[0].resource && bundle.entry[0].resource.resourceType;
    console.log("first entry resourceType=" + rt + " id=" + firstId);
    if (firstId) {
      out.calls.patient_read = toolText(await mcp.callTool("fhir_read", {
        resourceType: "Patient",
        id: String(firstId),
      }));
      console.log("\n--- fhir_read first Patient ---");
      console.log(truncate(out.calls.patient_read, 2500));
    }
  } else if (isAuthFail(bundle)) {
    console.log("search failed explicitly (no invented Patient):", bundle);
  } else {
    console.log("search returned no entry; not inventing a Patient");
  }

  out.calls.empty_search = toolText(await mcp.callTool("fhir_search", {
    resourceType: "Patient",
    params: { name: "ZZZNOMATCH999", _count: "1" },
  }));
  console.log("\n--- fhir_search Patient name=ZZZNOMATCH999 ---");
  console.log(truncate(out.calls.empty_search, 2000));

  out.calls.missing_read = toolText(await mcp.callTool("fhir_read", {
    resourceType: "Patient",
    id: "does-not-exist-zzz-999",
  }));
  console.log("\n--- fhir_read unknown id ---");
  console.log(truncate(out.calls.missing_read, 1500));

  out.calls.allowlist = toolText(await mcp.callTool("fhir_search", {
    resourceType: "DiagnosticReport",
  }));
  console.log("\n--- fhir_search DiagnosticReport ---");
  console.log(truncate(out.calls.allowlist, 800));

  out.calls.bad_iss = toolText(await mcp.callTool("fhir_search", {
    resourceType: "Patient",
    iss: "https://example.com/fhir",
  }));
  console.log("\n--- fhir_search iss https://example.com/fhir ---");
  console.log(truncate(out.calls.bad_iss, 800));

  await mcp.close();
  if (mcp.stderr.trim()) {
    console.log("\n--- server stderr (tail) ---");
    console.log(mcp.stderr.slice(-1500));
  }
  return out;
}

async function runBearer(iss) {
  banner("BEARER live try ISS=" + iss + " token=not-a-real-token");
  const mcp = new StdioMcp({
    FHIR_ISS: iss,
    FHIR_VERSION: "R4",
    FHIR_AUTH_MODE: "bearer",
    FHIR_ACCESS_TOKEN: "not-a-real-token",
    FHIR_WRITE: "off",
    FHIR_AUDIT_PATH: HOME + "/audit/audit.jsonl",
  });
  mcp.start();
  await mcp.initialize();
  const body = toolText(await mcp.callTool("fhir_search", {
    resourceType: "Patient",
    params: { _count: "1" },
  }));
  console.log(truncate(body, 1500));
  await mcp.close();
  return body;
}

async function importHandlersPath() {
  banner("HANDLER IMPORT PATH (same process, live fetch)");
  const { parseConfig } = await import(pathToFileURL(HOME + "/dist/config.js").href);
  const { FhirClient } = await import(pathToFileURL(HOME + "/dist/fhir-client.js").href);
  const { AuditLog } = await import(pathToFileURL(HOME + "/dist/audit.js").href);
  const tools = await import(pathToFileURL(HOME + "/dist/tools.js").href);
  const parsed = parseConfig({
    FHIR_ISS: DEFAULT_ISS,
    FHIR_VERSION: "R4",
    FHIR_AUTH_MODE: "open",
    FHIR_WRITE: "off",
    FHIR_AUDIT_PATH: HOME + "/audit/audit.jsonl",
  });
  if (!parsed.ok) {
    console.log("parseConfig failed", parsed);
    return;
  }
  const client = new FhirClient(parsed.config);
  const audit = new AuditLog(parsed.config.auditPath);
  const ctx = { client, audit };
  const disco = tools.parseToolJson(await tools.runSmartDiscover({}, ctx));
  console.log("import smart_discover token_endpoint:", disco.token_endpoint || "(missing)");
  const status = tools.parseToolJson(await tools.runFhirAuthStatus({}, ctx));
  console.log("import fhir_auth_status:", JSON.stringify(status));
}

async function showAudit() {
  banner("AUDIT last lines");
  const path = HOME + "/audit/audit.jsonl";
  if (!existsSync(path)) {
    console.log("audit file missing");
    return;
  }
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  const last = lines.slice(-20);
  for (const line of last) console.log(line);
  const joined = last.join("\n");
  const leaks = [];
  if (joined.includes("not-a-real-token")) leaks.push("token-value");
  if (/BEGIN [A-Z ]*PRIVATE/.test(joined)) leaks.push("pem");
  if (joined.includes('"entry":[')) leaks.push("bundle-body");
  if (joined.includes("ZZZNOMATCH999")) leaks.push("query-name");
  console.log(leaks.length ? "LEAKS: " + leaks.join(",") : "no token/PEM/body/query-name in last lines");
}

async function main() {
  if (!existsSync(DIST)) {
    console.error("missing build");
    process.exit(1);
  }
  const baseEnv = {
    FHIR_ISS: DEFAULT_ISS,
    FHIR_VERSION: "R4",
    FHIR_AUTH_MODE: "open",
    FHIR_WRITE: "off",
    FHIR_AUDIT_PATH: HOME + "/audit/audit.jsonl",
  };

  let suite = await runSuite("default-launcher", baseEnv);
  let search = suite.calls.patient_search;
  if (isAuthFail(search) && (search.http_status === 401 || search.http_status === 403)) {
    console.log("Launcher required a token. Trying fallbacks. No invented Patient.");
    for (const iss of FALLBACKS) {
      try {
        suite = await runSuite("fallback " + iss, Object.assign({}, baseEnv, { FHIR_ISS: iss }));
        search = suite.calls.patient_search;
        if (!isAuthFail(search)) break;
      } catch (e) {
        console.log("fallback failed", e && e.message ? e.message : e);
      }
    }
  }
  try { await runBearer(DEFAULT_ISS); }
  catch (e) { console.log("bearer live try error:", e && e.message ? e.message : e); }
  try { await importHandlersPath(); }
  catch (e) { console.log("handler import path error:", e && e.message ? e.message : e); }
  await showAudit();
  banner("PROVE DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
