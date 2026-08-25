import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  ALLOWED_ISS,
  DEFAULT_ISS,
  DEFAULT_SCOPE,
  type AuthMode,
  type Config,
} from "./types.js";

export { ALLOWED_ISS, DEFAULT_ISS };

export function normalizeIss(iss: string): string {
  return iss.trim().replace(/\/+$/, "");
}

export function isAllowedIss(iss: string): boolean {
  const n = normalizeIss(iss);
  return (ALLOWED_ISS as readonly string[]).includes(n);
}

const AUTH_MODES: readonly AuthMode[] = ["open", "bearer", "backend_jwt"];

export function parseConfig(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; config: Config } | { ok: false; error: string } {
  const fhirVersion = env.FHIR_VERSION ?? "R4";
  if (fhirVersion !== "R4") {
    return {
      ok: false,
      error: `FHIR_VERSION must be R4 (v1 lock). Official index http://hl7.org/fhir/ is the R5 landing page and is not implemented. Got: ${fhirVersion}`,
    };
  }

  const iss = normalizeIss(env.FHIR_ISS ?? DEFAULT_ISS);
  if (!isAllowedIss(iss)) {
    return {
      ok: false,
      error: `ISS not in v1 allowlist (normalize: strip trailing slash). Refused: ${iss}`,
    };
  }

  const writeRaw = env.FHIR_WRITE ?? "off";
  if (writeRaw !== "off" && !isAllowedIss(iss)) {
    return {
      ok: false,
      error: "FHIR_WRITE is not off and ISS is not allowlisted; refusing to start. v1 has no write tools.",
    };
  }

  const modeRaw = (env.FHIR_AUTH_MODE ?? "open").trim();
  if (!AUTH_MODES.includes(modeRaw as AuthMode)) {
    return {
      ok: false,
      error: `FHIR_AUTH_MODE must be open|bearer|backend_jwt. App Launch (code+PKCE) is out of v1. Got: ${modeRaw}`,
    };
  }
  const authMode = modeRaw as AuthMode;

  const clientId = env.FHIR_CLIENT_ID || env.SMART_CLIENT_ID || undefined;
  const privateKeyPem = env.FHIR_PRIVATE_KEY_PEM || undefined;

  if (authMode === "backend_jwt") {
    if (!clientId || !privateKeyPem) {
      return {
        ok: false,
        error:
          "backend_jwt requires FHIR_CLIENT_ID (or SMART_CLIENT_ID) and FHIR_PRIVATE_KEY_PEM. Do not invent credentials. Morning open mode does not need these.",
      };
    }
  }

  const auditPath =
    env.FHIR_AUDIT_PATH ?? "./audit/audit.jsonl";

  const config: Config = {
    iss,
    fhirVersion: "R4",
    authMode,
    write: "off",
    auditPath,
    accessToken: env.FHIR_ACCESS_TOKEN || undefined,
    clientId,
    privateKeyPem,
    jwksUrl: env.FHIR_JWKS_URL || undefined,
    scope: env.FHIR_SCOPE || DEFAULT_SCOPE,
    redirectUri: env.FHIR_REDIRECT_URI || undefined,
  };

  return { ok: true, config };
}

export function ensureAuditDir(auditPath: string): void {
  mkdirSync(dirname(auditPath), { recursive: true });
}

export function mustLoadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = parseConfig(env);
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exit(1);
  }
  ensureAuditDir(parsed.config.auditPath);
  return parsed.config;
}
