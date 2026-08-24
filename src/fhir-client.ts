import { createPrivateKey, createSign, randomUUID } from "node:crypto";
import { isAllowedIss, normalizeIss } from "./config.js";
import type {
  AuthError,
  AuthMode,
  Config,
  ResourceType,
  SmartConfiguration,
} from "./types.js";

export type FetchFn = typeof fetch;

const FHIR_ACCEPT = "application/fhir+json";
const JSON_ACCEPT = "application/json";
const USER_AGENT = "smart-fhir-mcp/1.0";
const FETCH_MS = 20_000;

export function snippet(text: string, max = 400): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function toAuthError(http_status: number, body: unknown, fallback: string): AuthError {
  const err: AuthError = { ok: false, http_status, error: fallback };
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    if (rec.issue !== undefined) err.issue = rec.issue;
    if (typeof rec.error === "string") err.error = rec.error;
    else if (rec.resourceType === "OperationOutcome") err.error = fallback;
  } else if (typeof body === "string" && body.length > 0) {
    err.error = snippet(body);
  }
  return err;
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function signBackendJwt(
  clientId: string,
  privateKeyPem: string,
  tokenEndpoint: string,
): string {
  const key = createPrivateKey(privateKeyPem);
  const type = key.asymmetricKeyType;
  const alg = type === "ec" ? "ES384" : "RS384";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg, typ: "JWT" };
  const payload = {
    iss: clientId,
    sub: clientId,
    aud: tokenEndpoint,
    jti: randomUUID(),
    iat: now,
    exp: now + 300,
  };
  const data = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const hash = alg === "ES384" || alg === "RS384" ? "SHA384" : "SHA256";
  const signer = createSign(hash);
  signer.update(data);
  signer.end();
  const sig = signer.sign(key);
  return `${data}.${sig.toString("base64url")}`;
}

export class FhirClient {
  lastError?: string;
  discoveryOk = false;
  lastDiscovery?: SmartConfiguration;
  private tokenCache?: { access_token: string; expires_at: number };

  constructor(
    public config: Config,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  resolveIss(iss?: string): { ok: true; iss: string } | { ok: false; error: string } {
    const raw = iss ?? this.config.iss;
    const n = normalizeIss(raw);
    if (!isAllowedIss(n)) {
      return { ok: false, error: "ISS not in v1 allowlist" };
    }
    return { ok: true, iss: n };
  }

  private async doFetch(
    url: string,
    init: RequestInit,
  ): Promise<{ status: number; json: unknown; text: string }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_MS);
    try {
      const res = await this.fetchFn(url, { ...init, signal: ctrl.signal });
      const text = await res.text();
      let json: unknown = undefined;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }
      return { status: res.status, json, text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError = msg;
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  async discover(issOverride?: string): Promise<SmartConfiguration | AuthError> {
    const resolved = this.resolveIss(issOverride);
    if (!resolved.ok) {
      this.lastError = resolved.error;
      return { ok: false, http_status: 0, error: resolved.error };
    }
    const url = `${resolved.iss}/.well-known/smart-configuration`;
    try {
      const { status, json, text } = await this.doFetch(url, {
        method: "GET",
        headers: {
          Accept: JSON_ACCEPT,
          "User-Agent": USER_AGENT,
        },
      });
      if (status >= 200 && status < 300 && json && typeof json === "object") {
        const parsed = json as SmartConfiguration;
        if (!issOverride || normalizeIss(issOverride) === this.config.iss) {
          this.discoveryOk = true;
          this.lastDiscovery = parsed;
          this.lastError = undefined;
        }
        return parsed;
      }
      const err = toAuthError(
        status,
        json ?? text,
        `smart-configuration HTTP ${status}: ${snippet(text)}`,
      );
      if (!issOverride || normalizeIss(issOverride) === this.config.iss) {
        this.discoveryOk = false;
        this.lastError = err.error;
      }
      return err;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err: AuthError = { ok: false, http_status: 0, error: `discovery failed: ${msg}` };
      if (!issOverride || normalizeIss(issOverride) === this.config.iss) {
        this.discoveryOk = false;
        this.lastError = err.error;
      }
      return err;
    }
  }

  /**
   * Open-mode discovery 404 is not fatal: log and continue.
   */
  async warmupDiscovery(): Promise<void> {
    const result = await this.discover();
    if ("ok" in result && result.ok === false) {
      if (this.config.authMode === "open" && (result.http_status === 404 || result.http_status === 0)) {
        console.error(
          `smart-configuration not available at ${this.config.iss} (HTTP ${result.http_status}); continuing in open mode`,
        );
        return;
      }
      if (this.config.authMode === "open") {
        console.error(`smart-configuration error in open mode: ${result.error ?? result.http_status}`);
      }
    }
  }

  private async authorizationHeader(iss: string): Promise<string | AuthError | undefined> {
    const mode: AuthMode = this.config.authMode;
    if (mode === "open") return undefined;

    if (mode === "bearer") {
      if (!this.config.accessToken) {
        const err: AuthError = {
          ok: false,
          http_status: 0,
          error: "FHIR_ACCESS_TOKEN required for bearer mode",
        };
        this.lastError = err.error;
        return err;
      }
      return `Bearer ${this.config.accessToken}`;
    }

    // backend_jwt
    if (!this.config.clientId || !this.config.privateKeyPem) {
      const err: AuthError = {
        ok: false,
        http_status: 0,
        error: "backend_jwt requires FHIR_CLIENT_ID (or SMART_CLIENT_ID) and FHIR_PRIVATE_KEY_PEM",
      };
      this.lastError = err.error;
      return err;
    }

    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expires_at > now + 15_000) {
      return `Bearer ${this.tokenCache.access_token}`;
    }

    const disco = this.lastDiscovery ?? (await this.discover(iss));
    if (disco && typeof disco === "object" && (disco as AuthError).ok === false) {
      return disco as AuthError;
    }
    const cfg = disco as SmartConfiguration;
    const tokenEndpoint = cfg.token_endpoint;
    if (!tokenEndpoint || typeof tokenEndpoint !== "string") {
      const err: AuthError = {
        ok: false,
        http_status: 0,
        error: "smart-configuration missing token_endpoint; not inventing one",
      };
      this.lastError = err.error;
      return err;
    }

    let assertion: string;
    try {
      assertion = signBackendJwt(this.config.clientId, this.config.privateKeyPem, tokenEndpoint);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err: AuthError = { ok: false, http_status: 0, error: `JWT sign failed: ${msg}` };
      this.lastError = err.error;
      return err;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
      scope: this.config.scope,
    });

    try {
      const { status, json, text } = await this.doFetch(tokenEndpoint, {
        method: "POST",
        headers: {
          Accept: JSON_ACCEPT,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: body.toString(),
      });
      if (status >= 200 && status < 300 && json && typeof json === "object") {
        const rec = json as Record<string, unknown>;
        if (typeof rec.access_token === "string") {
          const expiresIn = typeof rec.expires_in === "number" ? rec.expires_in : 300;
          this.tokenCache = {
            access_token: rec.access_token,
            expires_at: Date.now() + expiresIn * 1000,
          };
          return `Bearer ${rec.access_token}`;
        }
      }
      const err = toAuthError(status, json ?? text, `token endpoint HTTP ${status}: ${snippet(text)}`);
      this.lastError = err.error;
      return err;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err: AuthError = { ok: false, http_status: 0, error: `token request failed: ${msg}` };
      this.lastError = err.error;
      return err;
    }
  }

  private async fhirHeaders(iss: string): Promise<Record<string, string> | AuthError> {
    const headers: Record<string, string> = {
      Accept: FHIR_ACCEPT,
      "User-Agent": USER_AGENT,
    };
    const auth = await this.authorizationHeader(iss);
    if (auth && typeof auth === "object" && auth.ok === false) return auth;
    if (typeof auth === "string") headers.Authorization = auth;
    return headers;
  }

  async search(
    resourceType: ResourceType,
    params: Record<string, string> = {},
    issOverride?: string,
  ): Promise<Record<string, unknown> | AuthError> {
    const resolved = this.resolveIss(issOverride);
    if (!resolved.ok) {
      this.lastError = resolved.error;
      return { ok: false, http_status: 0, error: resolved.error };
    }

    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "resourceType" || k === "iss") continue;
      q.set(k, v);
    }
    let count = Number(q.get("_count") ?? "10");
    if (!Number.isFinite(count) || count <= 0) count = 10;
    if (count > 50) count = 50;
    q.set("_count", String(count));

    const url = `${resolved.iss}/${resourceType}?${q.toString()}`;
    const headers = await this.fhirHeaders(resolved.iss);
    if ("ok" in headers && headers.ok === false) return headers;

    try {
      const { status, json, text } = await this.doFetch(url, {
        method: "GET",
        headers: headers as Record<string, string>,
      });
      if (status === 401 || status === 403) {
        const err = toAuthError(status, json ?? text, `FHIR ${status}`);
        this.lastError = err.error;
        return err;
      }
      if (status < 200 || status >= 300) {
        const err = toAuthError(status, json ?? text, `FHIR search HTTP ${status}: ${snippet(text)}`);
        this.lastError = err.error;
        return err;
      }
      if (json && typeof json === "object") {
        return json as Record<string, unknown>;
      }
      const err: AuthError = {
        ok: false,
        http_status: status,
        error: `FHIR search returned non-JSON: ${snippet(text)}`,
      };
      this.lastError = err.error;
      return err;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err: AuthError = { ok: false, http_status: 0, error: `FHIR search failed: ${msg}` };
      this.lastError = err.error;
      return err;
    }
  }

  async read(
    resourceType: ResourceType,
    id: string,
    issOverride?: string,
  ): Promise<Record<string, unknown> | AuthError> {
    const resolved = this.resolveIss(issOverride);
    if (!resolved.ok) {
      this.lastError = resolved.error;
      return { ok: false, http_status: 0, error: resolved.error };
    }

    const url = `${resolved.iss}/${resourceType}/${encodeURIComponent(id)}`;
    const headers = await this.fhirHeaders(resolved.iss);
    if ("ok" in headers && headers.ok === false) return headers;

    try {
      const { status, json, text } = await this.doFetch(url, {
        method: "GET",
        headers: headers as Record<string, string>,
      });
      if (status === 401 || status === 403 || status === 404) {
        const err = toAuthError(status, json ?? text, `FHIR ${status}`);
        this.lastError = err.error;
        return err;
      }
      if (status < 200 || status >= 300) {
        const err = toAuthError(status, json ?? text, `FHIR read HTTP ${status}: ${snippet(text)}`);
        this.lastError = err.error;
        return err;
      }
      if (json && typeof json === "object") {
        return json as Record<string, unknown>;
      }
      const err: AuthError = {
        ok: false,
        http_status: status,
        error: `FHIR read returned non-JSON: ${snippet(text)}`,
      };
      this.lastError = err.error;
      return err;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err: AuthError = { ok: false, http_status: 0, error: `FHIR read failed: ${msg}` };
      this.lastError = err.error;
      return err;
    }
  }

  authStatus(): {
    mode: AuthMode;
    iss: string;
    fhir_version: "R4";
    write: "off";
    token_present: boolean;
    discovery_ok: boolean;
    last_error?: string;
  } {
    const token_present =
      this.config.authMode === "bearer"
        ? Boolean(this.config.accessToken)
        : this.config.authMode === "backend_jwt"
          ? Boolean(this.tokenCache?.access_token)
          : false;
    const out = {
      mode: this.config.authMode,
      iss: this.config.iss,
      fhir_version: "R4" as const,
      write: "off" as const,
      token_present,
      discovery_ok: this.discoveryOk,
      ...(this.lastError ? { last_error: this.lastError } : {}),
    };
    return out;
  }
}
