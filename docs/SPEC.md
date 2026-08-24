# SPEC — SMART on FHIR MCP v1

**Date:** 2026-08-24 (early morning CT)
**Design only.** Builder implements on the box. No migrate. No CloudAgent. No GitHub write in this turn.
**Deadline:** Mon 2026-08-24 8:00am America/Chicago. Hard cap Tue 8:00am if blocked.
**Home:** https://github.com/swami8791/smart-fhir-mcp (public). **Not** KeepAfter. **Not** hermes-os.
**Catalog:** Cursor SearchPlugins for FHIR / SMART FHIR / HL7 EHR returned **no** FHIR connector (2026-08-24). Path is local stdio via `AddMcpServer` (`command` / `args` / `env`).

KeepAfter is wellness, not medical. hermes-os is the personal OS. This connector is **neither product**. Personal team.

## Official index (Nehal via CC, 2026-08-24)

Cite these. Do **not** treat the current FHIR landing page as a v1 version change.

| What | URL | How to read it |
| --- | --- | --- |
| FHIR index (published page is **R5 5.0.0**) | http://hl7.org/fhir/ | Official index only. **Not** the v1 version. |
| FHIR **R4** (v1) | https://hl7.org/fhir/R4/ | FHIR Release 4, **4.0.1**. This is the resource model. |
| SMART App Launch **2.2.0** (STU 2.2) | https://hl7.org/fhir/smart-app-launch/ | Current published SMART IG. **Based on FHIR R4.** |
| App launch + authorization | https://hl7.org/fhir/smart-app-launch/app-launch.html | Discovery, standalone/EHR launch, PKCE, token, FHIR access. |
| Backend Services | https://hl7.org/fhir/smart-app-launch/backend-services.html | `client_credentials` + private-key JWT. |

**v1 lock:** FHIR **R4** (4.0.1) because SMART 2.2 is an R4 IG and public sandboxes / EHRs still speak R4. Do **not** implement R5 unless he later says R5.

SMART 2.2 also says the IG is compatible with DSTU2 onward. That does not change the v1 lock.

## Constraint that picks the stack

- **Write-thin TypeScript stdio MCP on the box** (Node already on the box; `AddMcpServer` runs a local `command`).
- Not a marketplace plugin (none exists).
- Not a second cloud DB. Not a production deploy.
- Not vendoring a CRUD/Pinecone/Medplum server. Not depending on an unpublished paper repo.

## OSS evaluate (do not blindly vendor)

| Source | What I actually saw | Verdict |
| --- | --- | --- |
| [the-momentum/fhir-mcp-server](https://github.com/the-momentum/fhir-mcp-server) | README (raw `main`): FastMCP Python, **full CRUD**, generic **OAuth2** (`FHIR_SERVER_HOST`, `FHIR_BASE_URL`, `FHIR_SERVER_CLIENT_ID`, `FHIR_SERVER_CLIENT_SECRET`), Pinecone + LOINC, Docker/`uv`. MIT. Demo vs Medplum. Roadmap: other auth later. **Not SMART-first** (no `.well-known/smart-configuration` in that README). | **Do not vendor.** Extra vendors, writes, secrets, not SMART 2.2. |
| [faulkj/fhirhydrant](https://github.com/faulkj/fhirhydrant) | GitHub landing: Node FHIR MCP, **SMART Backend Services JWT**, search/CRUD, stdio or Streamable HTTP, audit events. Needs Node >=24, a registered Backend Services client, RSA-2048 private key + JWKS. Raw `README.md` on `main` **404** this turn (label: landing + search snippet only). | **Do not ship as the morning binary.** JWT path needs a client_id + key we do not have. May **read later** as JWT reference. |
| [Atrium paper](https://chandravikram.com/papers/01-atrium) | Public paper: TS SMART-on-FHIR MCP, stdio + Streamable HTTP, FHIR **R4**, seven types, SMART OAuth, append-only audit, zero invented patient facts. | **Pattern, not a dependency.** GitHub search 2026-08-24 found **no public Atrium repo**. Cannot clone what is not published. |
| Other (not requested) | `jsfaulkner86/ehr-mcp` (Backend Services + Epic), `DhairyaShah981/fhir-mcp` (reid + optional Supabase). | Out. Extra surface, secrets, or a cloud DB. |

**Use vs wrap vs write:** **write-thin.** Use the official SMART 2.2 flows and the public SMART Health IT R4 sandbox. Do not wrap momentum. Do not wrap hydrant for v1. Do not wait on Atrium source.

## Morning sandbox (public synthetic only)

**Default ISS (lock):** `https://launch.smarthealthit.org/v/r4/fhir`

Evidence 2026-08-24:

- Discovery **200**: `GET https://launch.smarthealthit.org/v/r4/fhir/.well-known/smart-configuration` returned JSON with `authorization_endpoint`, `token_endpoint`, `grant_types_supported`: `authorization_code`, `client_credentials`; `token_endpoint_auth_methods_supported` includes `private_key_jwt`; `code_challenge_methods_supported`: `S256`; capabilities include `launch-standalone`, `client-public`, `client-confidential-asymmetric`, `permission-v2`.
- Open search **200** without `Authorization`: `GET .../Patient?_count=1` returned a `searchset` Bundle, Synthea-tagged Patient `1ac8947d-038f-4cc7-81fa-a32e694187e8`. **Sourced this fetch.** Do not hardcode that id; search again at runtime.
- Third-party OpenAPI text says the launcher FHIR proxy requires an OAuth token. **Our fetch did not.** If the proxy later requires a token, `fhir_auth_status` / read / search **must fail explicitly** (no invented Patient). Then Builder may flip `FHIR_ISS` to the open-only fallback.

**Allowlisted ISS only** (anything else is refused until a later lock + Sentinel):

| ISS | Role |
| --- | --- |
| `https://launch.smarthealthit.org/v/r4/fhir` | Default. Discovery + (today) open R4 read/search. |
| `https://r4.smarthealthit.org` | Open FHIR R4, no auth (SMART open-server docs). This turn: `/.well-known/smart-configuration` **404**. Use when we need open read and do not need discovery. |
| `https://hapi.fhir.org/baseR4` | Public HAPI R4. This turn: `Patient?_count=1` **200**, header `FHIR 4.0.1/R4`. Not SMART. Writes exist on public HAPI — **our writes stay off.** |

No live EHR. No real PHI. No Logica / Epic / Oracle sandbox until he gives ISS + client_id and Sentinel has reviewed.

## Auth flows (v1)

Discovery is always implemented. Token is optional.

| Mode | When | What Builder does |
| --- | --- | --- |
| **`open`** (default) | `FHIR_AUTH_MODE=open` or unset | `GET {iss}/.well-known/smart-configuration` (Accept: `application/json`). Then FHIR GET **without** `Authorization`. 401/403 → explicit auth error, no fake row. Discovery 404 is **not** fatal in `open` (log it; continue). |
| **`bearer`** | `FHIR_ACCESS_TOKEN` set | Same discovery. FHIR GET with `Authorization: Bearer <token>`. |
| **`backend_jwt`** | `FHIR_CLIENT_ID` **and** `FHIR_PRIVATE_KEY_PEM` both set | SMART Backend Services: discover `token_endpoint`; POST `grant_type=client_credentials`, `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, `client_assertion` = private-key JWT, `scope` = `system/Patient.rs system/Observation.rs system/Condition.rs system/MedicationRequest.rs system/Encounter.rs` (v2 letters; v1 `.read` is the older alias). Then Bearer. **Do not invent a client_id or key.** If either env is missing, do **not** enter this mode. Morning v1 may ship the code path unused. |
| **App Launch (code + PKCE)** | Needs `client_id`, `redirect_uri`, a browser | **Out of morning v1.** Env names reserved below. No interactive login on the box this wave. |

Public clients exist in SMART 2.2; App Launch still needs a `client_id` from registration. We do not have one. Do not block morning on that.

Auth failure (non-2xx token, 401/403 FHIR, missing required env for the selected mode): tool result is an **error object** (`ok: false`, HTTP status, server `issue`/`error` if present). Never a synthetic Patient.

## Tools (stdio MCP)

Four tools. No generic any-resource. No create/update/delete.

### `smart_discover`

- Input: optional `iss` (default `FHIR_ISS`).
- Action: `GET {iss}/.well-known/smart-configuration`.
- Output: parsed JSON (issuer, authorization_endpoint, token_endpoint, grant_types_supported, capabilities, scopes_supported) **or** explicit error (status + body snippet).
- Does not invent endpoints.

### `fhir_auth_status`

- Output: `{ mode, iss, fhir_version: "R4", write: "off", token_present: bool, discovery_ok: bool, last_error?: string }`.
- Never prints the token or the PEM.

### `fhir_search`

- Input: `resourceType` (enum below), optional FHIR search params as a **flat string map** (`name`, `patient`, `code`, `_count`, `_id`, …). Unknown keys passed through as query params.
- Action: `GET {iss}/{resourceType}?…` with `_count` default `10`, max `50`.
- Output: the FHIR Bundle **as returned**, or explicit error.
- If Bundle `total=0` or no `entry`: return that empty Bundle. **Do not invent a Patient.**

### `fhir_read`

- Input: `resourceType`, `id`.
- Action: `GET {iss}/{resourceType}/{id}`.
- Output: the resource JSON, or explicit 404/401/error. 404 is not found, not a made-up resource.

**Allowlist:** `Patient` | `Observation` | `Condition` | `MedicationRequest` | `Encounter`. Any other type → tool error (`resourceType not in v1 allowlist`).

Accept `application/fhir+json`. Follow at most **one** Bundle `next` link if the tool is called again by the model (v1: do not auto-walk the chain).

## Audit (append-only)

File: `FHIR_AUDIT_PATH` default `/workspace/smart-fhir-mcp/audit/audit.jsonl`.

Each tool call appends one JSON line: `ts`, `tool`, `iss`, `mode`, `resourceType`, `id?`, `http_status`, `entry_count?`. **No** resource body, **no** token, **no** PEM, **no** query values that look like names/MRNs if we can avoid them (store resourceType + id + status only).

Do **not** POST `AuditEvent` back to the FHIR server (that is a write).

Create the file if missing. Never truncate.

## Env vars (no secrets in this spec)

| Name | Morning | Later real endpoint |
| --- | --- | --- |
| `FHIR_ISS` | default launcher R4 base above | real ISS (Sentinel first) |
| `FHIR_VERSION` | `R4` (reject anything else) | still R4 until he says R5 |
| `FHIR_AUTH_MODE` | `open` | `bearer` | `backend_jwt` | later `app_launch` |
| `FHIR_WRITE` | `off` (required). If `on`, refuse to start unless ISS is allowlisted and labeled sandbox — **still implement no write tools in v1** | still off until a later lock |
| `FHIR_AUDIT_PATH` | box path above | same |
| `FHIR_ACCESS_TOKEN` | unset | optional Bearer |
| `FHIR_CLIENT_ID` | unset | Backend Services or App Launch |
| `FHIR_PRIVATE_KEY_PEM` | unset | Backend Services JWT |
| `FHIR_JWKS_URL` | unset | if the EHR wants a JWKS URL |
| `FHIR_SCOPE` | default five system/*.rs types for JWT mode | override |
| `FHIR_REDIRECT_URI` | unset, App Launch later | reserved |
| `SMART_CLIENT_ID` | alias of FHIR_CLIENT_ID | same |

Do not put values in the repo. Do not log them.

## Desk connect

After Builder ships /workspace/smart-fhir-mcp and a build produces dist/index.js, Command Center adds a local stdio connector:

name: smart-fhir
command: node
args: /workspace/smart-fhir-mcp/dist/index.js
env FHIR_ISS = launcher R4 base (https://launch.smarthealthit.org/v/r4/fhir)
env FHIR_VERSION = R4
env FHIR_AUTH_MODE = open
env FHIR_WRITE = off
env FHIR_AUDIT_PATH = /workspace/smart-fhir-mcp/audit/audit.jsonl

Morning shortcut if build is tight: npx -y tsx /workspace/smart-fhir-mcp/src/index.ts with the same env. Constraint: the box already has npx.

This add changes the user account. Command Center confirms first. Architect does not add it. Same command is visible to this users other agents. stdio only. Do not bind a public HTTP port.

## What Builder writes on the box

/workspace/smart-fhir-mcp/ is a new tree. package.json plus TypeScript plus the current MCP SDK. FHIR HTTP via fetch. If time is short, ship open plus bearer plus smart_discover first. Leave backend_jwt as a stub that errors when env is not set. That still meets morning if open search works.

No clone onto Mini or MacBook. No second database. Repo is public: https://github.com/swami8791/smart-fhir-mcp.

## Out of scope (v1)

R5 or R4B as the default. DiagnosticReport, AllergyIntolerance, or extra Atrium types. Synthea 10k seed, eval harness, Pinecone, LOINC accounts. CRUD, writes, export, Bulk. App Launch browser/PKCE. Real EHR, real PHI, production deploy, public post. Money, legal, deletes. Graphiti, Mem0, Mini sot as a FHIR store. KeepAfter product copy or hermes-os repo. Public bind or Streamable HTTP facing the network.

## Security / Sentinel

v1 is public synthetic sandboxes on an ISS allowlist. Require Sentinel before any ISS not in that list, before storing a real token or PEM, and before anyone calls this a medical product. KeepAfter stays wellness, not medical. This connector does not diagnose.

If Builder would open a public port or put secrets in git: stop and tell CI.

## Escalation (none now)

No SMART client_id required for morning open. No repo-create token required for box ship. No real EHR. If those appear, stop and tell CI.

Also out (research, not requested): anthropics healthcare mcp-server-fhir (experimental, plugin-coupled); pcmedsinge / wso2 / DhairyaShah981 fhir-mcp variants. Do not vendor those for morning v1.
