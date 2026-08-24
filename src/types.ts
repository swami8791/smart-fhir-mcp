export const RESOURCE_TYPES = [
  "Patient",
  "Observation",
  "Condition",
  "MedicationRequest",
  "Encounter",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const ALLOWED_ISS = [
  "https://launch.smarthealthit.org/v/r4/fhir",
  "https://r4.smarthealthit.org",
  "https://hapi.fhir.org/baseR4",
] as const;

export const DEFAULT_ISS = "https://launch.smarthealthit.org/v/r4/fhir";

export const DEFAULT_SCOPE =
  "system/Patient.rs system/Observation.rs system/Condition.rs system/MedicationRequest.rs system/Encounter.rs";

export type AuthMode = "open" | "bearer" | "backend_jwt";

export interface Config {
  iss: string;
  fhirVersion: "R4";
  authMode: AuthMode;
  write: "off";
  auditPath: string;
  accessToken?: string;
  clientId?: string;
  privateKeyPem?: string;
  jwksUrl?: string;
  scope: string;
  redirectUri?: string;
}

export interface AuthError {
  ok: false;
  http_status: number;
  issue?: unknown;
  error?: string;
}

export interface AuthStatus {
  mode: AuthMode;
  iss: string;
  fhir_version: "R4";
  write: "off";
  token_present: boolean;
  discovery_ok: boolean;
  last_error?: string;
}

export interface AuditLine {
  ts: string;
  tool: string;
  iss: string;
  mode: string;
  resourceType?: string;
  id?: string;
  http_status?: number;
  entry_count?: number;
}

export interface SmartConfiguration {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  grant_types_supported?: string[];
  capabilities?: string[];
  scopes_supported?: string[];
  [key: string]: unknown;
}

export function isResourceType(value: string): value is ResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(value);
}

export function isAuthError(value: unknown): value is AuthError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as AuthError).ok === false &&
    typeof (value as AuthError).http_status === "number"
  );
}
