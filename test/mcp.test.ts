import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditLog } from "../src/audit.js";
import { parseConfig } from "../src/config.js";
import { FhirClient } from "../src/fhir-client.js";
import {
  ALLOWLIST_ERROR,
  parseToolJson,
  runFhirAuthStatus,
  runFhirRead,
  runFhirSearch,
  runSmartDiscover,
} from "../src/tools.js";
import { DEFAULT_ISS, type Config } from "../src/types.js";

function tempAudit(): string {
  return join(mkdtempSync(join(tmpdir(), "smart-fhir-audit-")), "audit.jsonl");
}

function baseConfig(over: Partial<Config> = {}): Config {
  return {
    iss: DEFAULT_ISS,
    fhirVersion: "R4",
    authMode: "open",
    write: "off",
    auditPath: tempAudit(),
    scope: "system/Patient.rs",
    ...over,
  };
}

function ctx(config: Config, fetchFn: typeof fetch) {
  const client = new FhirClient(config, fetchFn);
  const audit = new AuditLog(config.auditPath);
  return { client, audit, path: config.auditPath };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/fhir+json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("startup parseConfig", () => {
  it("rejects FHIR_VERSION other than R4", () => {
    const r = parseConfig({ FHIR_VERSION: "R5" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/must be R4/);
  });

  it("rejects R4B", () => {
    const r = parseConfig({ FHIR_VERSION: "R4B" });
    expect(r.ok).toBe(false);
  });

  it("defaults FHIR_VERSION to R4", () => {
    const r = parseConfig({ FHIR_ISS: DEFAULT_ISS });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.fhirVersion).toBe("R4");
  });

  it("refuses non-allowlisted ISS at start", () => {
    const r = parseConfig({ FHIR_ISS: "https://example.com/fhir" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/allowlist/);
  });

  it("normalizes trailing slash on allowlisted ISS", () => {
    const r = parseConfig({ FHIR_ISS: "https://hapi.fhir.org/baseR4/" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.iss).toBe("https://hapi.fhir.org/baseR4");
  });

  it("backend_jwt without env errors and does not invent credentials", () => {
    const r = parseConfig({ FHIR_AUTH_MODE: "backend_jwt" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/FHIR_CLIENT_ID/);
      expect(r.error).toMatch(/FHIR_PRIVATE_KEY_PEM/);
      expect(r.error).not.toMatch(/-----BEGIN/);
    }
  });

  it("backend_jwt with only client id errors", () => {
    const r = parseConfig({
      FHIR_AUTH_MODE: "backend_jwt",
      FHIR_CLIENT_ID: "example-not-used",
    });
    expect(r.ok).toBe(false);
  });

  it("write stays off even if FHIR_WRITE=on on an allowlisted ISS", () => {
    const r = parseConfig({ FHIR_WRITE: "on", FHIR_ISS: DEFAULT_ISS });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.write).toBe("off");
  });
});

describe("resourceType allowlist", () => {
  it("rejects DiagnosticReport without calling fetch", async () => {
    const fetchFn = vi.fn();
    const c = ctx(baseConfig(), fetchFn);
    const out = parseToolJson(
      await runFhirSearch({ resourceType: "DiagnosticReport" }, c),
    ) as { ok: false; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toBe(ALLOWLIST_ERROR);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects AllergyIntolerance on read", async () => {
    const fetchFn = vi.fn();
    const c = ctx(baseConfig(), fetchFn);
    const out = parseToolJson(
      await runFhirRead({ resourceType: "AllergyIntolerance", id: "x" }, c),
    ) as { ok: false; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toBe(ALLOWLIST_ERROR);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("ISS refuse", () => {
  it("fhir_search refuses https://example.com/fhir without fetch", async () => {
    const fetchFn = vi.fn();
    const c = ctx(baseConfig(), fetchFn);
    const out = parseToolJson(
      await runFhirSearch(
        { resourceType: "Patient", iss: "https://example.com/fhir", params: { _count: "1" } },
        c,
      ),
    ) as { ok: false; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/allowlist/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("smart_discover refuses a non-allowlisted iss", async () => {
    const fetchFn = vi.fn();
    const c = ctx(baseConfig(), fetchFn);
    const out = parseToolJson(
      await runSmartDiscover({ iss: "https://evil.example/fhir" }, c),
    ) as { ok: false; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/allowlist/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("empty search / 404 read (mocked; not live Patient fixtures)", () => {
  it("empty search returns the empty Bundle and does not invent a Patient", async () => {
    const emptyBundle = {
      resourceType: "Bundle",
      type: "searchset",
      total: 0,
      entry: [] as unknown[],
    };
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/Patient?");
      return jsonResponse(200, emptyBundle);
    });
    const c = ctx(baseConfig(), fetchFn);
    const out = parseToolJson(
      await runFhirSearch(
        { resourceType: "Patient", params: { name: "ZZZNOMATCH999", _count: "1" } },
        c,
      ),
    ) as Record<string, unknown>;
    expect(out.ok).not.toBe(false);
    expect(out.resourceType).toBe("Bundle");
    expect(out.type).toBe("searchset");
    expect(out.total).toBe(0);
    expect(out.entry).toEqual([]);
    const dumped = JSON.stringify(out);
    expect(dumped).not.toMatch(/"resourceType":"Patient"/);
    expect(dumped).not.toContain("family");
    expect(dumped).not.toContain("given");
  });

  it("404 read is an explicit error, not a made-up resource", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(404, {
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "not-found" }],
      }),
    );
    const c = ctx(baseConfig(), fetchFn);
    const out = parseToolJson(
      await runFhirRead({ resourceType: "Patient", id: "does-not-exist-zzz" }, c),
    ) as { ok: false; http_status: number; issue?: unknown };
    expect(out.ok).toBe(false);
    expect(out.http_status).toBe(404);
    expect(JSON.stringify(out)).not.toMatch(/"resourceType":"Patient"/);
  });
});

describe("auth failure", () => {
  it("bad bearer returns ok:false + status and no fake Patient (mock 401)", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer not-a-real-token");
      return jsonResponse(401, { error: "invalid_token" });
    });
    const c = ctx(
      baseConfig({ authMode: "bearer", accessToken: "not-a-real-token" }),
      fetchFn,
    );
    const out = parseToolJson(
      await runFhirSearch({ resourceType: "Patient", params: { _count: "1" } }, c),
    ) as { ok: false; http_status: number; error?: string };
    expect(out.ok).toBe(false);
    expect(out.http_status).toBe(401);
    expect(JSON.stringify(out)).not.toMatch(/"resourceType":"Patient"/);
  });

  it("backend_jwt without env on a constructed client errors (no invented key)", async () => {
    const fetchFn = vi.fn();
    const c = ctx(baseConfig({ authMode: "backend_jwt" }), fetchFn);
    const out = parseToolJson(
      await runFhirSearch({ resourceType: "Patient" }, c),
    ) as { ok: false; error: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/FHIR_CLIENT_ID|FHIR_PRIVATE_KEY_PEM/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("fhir_auth_status", () => {
  it("reports write off and never prints token", async () => {
    const fetchFn = vi.fn();
    const c = ctx(
      baseConfig({ authMode: "bearer", accessToken: "super-secret-token-value" }),
      fetchFn,
    );
    const out = parseToolJson(await runFhirAuthStatus({}, c)) as Record<string, unknown>;
    expect(out.fhir_version).toBe("R4");
    expect(out.write).toBe("off");
    expect(out.mode).toBe("bearer");
    expect(out.token_present).toBe(true);
    expect(JSON.stringify(out)).not.toContain("super-secret-token-value");
    expect(JSON.stringify(out)).not.toContain("BEGIN");
  });
});

describe("audit", () => {
  it("appends one line per tool call with no token/PEM/body", async () => {
    const emptyBundle = {
      resourceType: "Bundle",
      type: "searchset",
      total: 0,
      entry: [],
    };
    const fetchFn = vi.fn(async () => jsonResponse(200, emptyBundle));
    const c = ctx(
      baseConfig({ authMode: "bearer", accessToken: "super-secret-token-value" }),
      fetchFn,
    );
    await runFhirSearch({ resourceType: "Patient", params: { name: "AliceSecret", _count: "1" } }, c);
    const raw = readFileSync(c.path, "utf8").trim();
    expect(raw.split("\n")).toHaveLength(1);
    const line = JSON.parse(raw) as Record<string, unknown>;
    expect(line.tool).toBe("fhir_search");
    expect(line.resourceType).toBe("Patient");
    expect(line.http_status).toBe(200);
    expect(line.entry_count).toBe(0);
    expect(raw).not.toContain("super-secret-token-value");
    expect(raw).not.toContain("BEGIN PRIVATE");
    expect(raw).not.toContain("AliceSecret");
    expect(raw).not.toContain("resourceType\":\"Bundle");
    expect(line.body).toBeUndefined();
    expect(line.token).toBeUndefined();
    expect(line.pem).toBeUndefined();
  });
});
