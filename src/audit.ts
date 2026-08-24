import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditLine } from "./types.js";

const FORBIDDEN = [
  "token",
  "pem",
  "authorization",
  "access_token",
  "private_key",
  "client_secret",
  "password",
];

function assertSafe(line: AuditLine): void {
  const raw = JSON.stringify(line).toLowerCase();
  for (const key of FORBIDDEN) {
    if (raw.includes(key)) {
      throw new Error("audit line would contain a forbidden key; refusing to write");
    }
  }
  if ("body" in line || "resource" in line || "entry" in line) {
    throw new Error("audit line must not include resource body");
  }
}

export class AuditLog {
  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) {
      appendFileSync(path, "", { encoding: "utf8" });
    }
  }

  append(partial: Omit<AuditLine, "ts"> & { ts?: string }): void {
    const line: AuditLine = {
      ts: partial.ts ?? new Date().toISOString(),
      tool: partial.tool,
      iss: partial.iss,
      mode: partial.mode,
    };
    if (partial.resourceType) line.resourceType = partial.resourceType;
    if (partial.id) line.id = partial.id;
    if (partial.http_status !== undefined) line.http_status = partial.http_status;
    if (partial.entry_count !== undefined) line.entry_count = partial.entry_count;
    assertSafe(line);
    appendFileSync(this.path, `${JSON.stringify(line)}\n`, { encoding: "utf8" });
  }
}

export function entryCountFromBundle(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  if (rec.resourceType !== "Bundle") return undefined;
  if (Array.isArray(rec.entry)) return rec.entry.length;
  if (typeof rec.total === "number") return rec.total;
  return 0;
}

export function httpStatusFromResult(body: unknown, fallback = 200): number {
  if (body && typeof body === "object" && (body as { ok?: unknown }).ok === false) {
    const s = (body as { http_status?: unknown }).http_status;
    if (typeof s === "number") return s;
    return 0;
  }
  return fallback;
}
