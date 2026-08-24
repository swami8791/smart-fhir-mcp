import { z } from "zod";
import { AuditLog, entryCountFromBundle, httpStatusFromResult } from "./audit.js";
import { FhirClient } from "./fhir-client.js";
import { isResourceType } from "./types.js";

export const ALLOWLIST_ERROR = "resourceType not in v1 allowlist";

export const discoverInput = z.object({
  iss: z.string().optional(),
});

export const searchInput = z.object({
  resourceType: z.string(),
  iss: z.string().optional(),
  params: z.record(z.string(), z.string()).optional(),
});

export const readInput = z.object({
  resourceType: z.string(),
  id: z.string(),
  iss: z.string().optional(),
});

export interface ToolContext {
  client: FhirClient;
  audit: AuditLog;
}

function jsonResult(value: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

export async function runSmartDiscover(
  args: { iss?: string },
  ctx: ToolContext,
): Promise<{ content: { type: "text"; text: string }[] }> {
  const result = await ctx.client.discover(args.iss);
  const iss = args.iss ?? ctx.client.config.iss;
  ctx.audit.append({
    tool: "smart_discover",
    iss,
    mode: ctx.client.config.authMode,
    http_status: httpStatusFromResult(result, 200),
  });
  return jsonResult(result);
}

export async function runFhirAuthStatus(
  _args: Record<string, never>,
  ctx: ToolContext,
): Promise<{ content: { type: "text"; text: string }[] }> {
  const result = ctx.client.authStatus();
  ctx.audit.append({
    tool: "fhir_auth_status",
    iss: ctx.client.config.iss,
    mode: ctx.client.config.authMode,
    http_status: 200,
  });
  return jsonResult(result);
}

export async function runFhirSearch(
  args: { resourceType: string; iss?: string; params?: Record<string, string> },
  ctx: ToolContext,
): Promise<{ content: { type: "text"; text: string }[] }> {
  if (!isResourceType(args.resourceType)) {
    const result = { ok: false as const, error: ALLOWLIST_ERROR };
    ctx.audit.append({
      tool: "fhir_search",
      iss: args.iss ?? ctx.client.config.iss,
      mode: ctx.client.config.authMode,
      resourceType: args.resourceType,
      http_status: 0,
    });
    return jsonResult(result);
  }
  const result = await ctx.client.search(args.resourceType, args.params ?? {}, args.iss);
  ctx.audit.append({
    tool: "fhir_search",
    iss: args.iss ?? ctx.client.config.iss,
    mode: ctx.client.config.authMode,
    resourceType: args.resourceType,
    http_status: httpStatusFromResult(result, 200),
    entry_count: entryCountFromBundle(result),
  });
  return jsonResult(result);
}

export async function runFhirRead(
  args: { resourceType: string; id: string; iss?: string },
  ctx: ToolContext,
): Promise<{ content: { type: "text"; text: string }[] }> {
  if (!isResourceType(args.resourceType)) {
    const result = { ok: false as const, error: ALLOWLIST_ERROR };
    ctx.audit.append({
      tool: "fhir_read",
      iss: args.iss ?? ctx.client.config.iss,
      mode: ctx.client.config.authMode,
      resourceType: args.resourceType,
      id: args.id,
      http_status: 0,
    });
    return jsonResult(result);
  }
  const result = await ctx.client.read(args.resourceType, args.id, args.iss);
  ctx.audit.append({
    tool: "fhir_read",
    iss: args.iss ?? ctx.client.config.iss,
    mode: ctx.client.config.authMode,
    resourceType: args.resourceType,
    id: args.id,
    http_status: httpStatusFromResult(result, 200),
  });
  return jsonResult(result);
}

export function parseToolJson(result: { content: { type: "text"; text: string }[] }): unknown {
  const text = result.content[0]?.text ?? "null";
  return JSON.parse(text);
}
