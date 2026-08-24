# SMART on FHIR MCP — Specs sheet

**Product:** smart-fhir (personal-team connector)
**Version:** v1.0.0
**Date:** 2026-08-24
**Status:** Built, verified, on the desk (`user-smart-fhir`, connected, stdio, 4 tools)
**Owner:** Nehal Swami / Command Center desk
**Not:** KeepAfter. Not hermes-os. Not a medical product. Does not diagnose, treat, or store PHI.

---

## What it is

A local stdio MCP server that talks to **public synthetic FHIR R4 sandboxes** using **SMART App Launch 2.2.0** discovery. Read and search only. Writes off.

Cursor catalog has no FHIR / SMART FHIR connector (checked 2026-08-24). This is ours.

| Field | Value |
| --- | --- |
| Home | `/workspace/smart-fhir-mcp` |
| Binary | `node /workspace/smart-fhir-mcp/dist/index.js` |
| Transport | stdio only. No public HTTP port. |
| Desk name | `smart-fhir` |
| Default ISS | `https://launch.smarthealthit.org/v/r4/fhir` |

---

## Standards (locked)

| What | Version | URL | How to read it |
| --- | --- | --- | --- |
| FHIR index | R5 5.0.0 landing | http://hl7.org/fhir/ | Official index. **Not implemented.** |
| FHIR resource model | **R4 4.0.1** | https://hl7.org/fhir/R4/ | v1 lock. Anything else refuses to start. |
| SMART App Launch | **2.2.0** (STU 2.2) | https://hl7.org/fhir/smart-app-launch/ | Current published SMART IG. Based on FHIR R4. |
| App launch + auth | SMART 2.2 | https://hl7.org/fhir/smart-app-launch/app-launch.html | Discovery, launch, PKCE, token. App Launch (code+PKCE) is **out of v1**. |
| Backend Services | SMART 2.2 | https://hl7.org/fhir/smart-app-launch/backend-services.html | JWT path is coded; unused until client_id + PEM exist. |

---

## Tools

| Tool | Action | Notes |
| --- | --- | --- |
| `smart_discover` | `GET {iss}/.well-known/smart-configuration` | Parsed JSON or explicit error. Does not invent endpoints. |
| `fhir_auth_status` | Report mode, ISS, R4 lock, write=off, token_present, discovery_ok | Never prints token or PEM. |
| `fhir_search` | `GET {iss}/{resourceType}` | `_count` default 10, max 50. One page. Empty Bundle returned as-is. |
| `fhir_read` | `GET {iss}/{resourceType}/{id}` | 404 is not found. Never a made-up resource. |

**resourceType allowlist:** Patient · Observation · Condition · MedicationRequest · Encounter

Anything else → `{ ok: false, error: "resourceType not in v1 allowlist" }`.

**Accept:** `application/fhir+json`

---

## ISS allowlist

Trailing slash stripped. Anything else is refused until a later lock + Sentinel review.

| ISS | Role |
| --- | --- |
| `https://launch.smarthealthit.org/v/r4/fhir` | Default. Discovery + open R4 read/search. |
| `https://r4.smarthealthit.org` | Open FHIR R4. Discovery may 404. |
| `https://hapi.fhir.org/baseR4` | Public HAPI R4. Not SMART. Writes exist on HAPI; **ours stay off.** |

No live EHR. No real PHI. No Epic / Oracle / Logica until ISS + client_id and a new Sentinel review.

---

## Auth

| Mode | When | Behavior |
| --- | --- | --- |
| `open` (desk default) | unset or `FHIR_AUTH_MODE=open` | Discover, then FHIR GET with no Authorization. Discovery 404 is not fatal in open. 401/403 → explicit error. |
| `bearer` | `FHIR_ACCESS_TOKEN` set | Same discovery. FHIR GET with Bearer. |
| `backend_jwt` | `FHIR_CLIENT_ID` (or `SMART_CLIENT_ID`) **and** `FHIR_PRIVATE_KEY_PEM` both set | SMART Backend Services JWT. Missing env → refuse to start. Does not invent credentials. |
| App Launch (code + PKCE) | — | **Out of v1.** `FHIR_REDIRECT_URI` reserved. |

Auth failure shape: `{ ok: false, http_status, issue?, error? }`. Never a synthetic Patient.

`FHIR_WRITE` is always treated as **off**. v1 has no write tools even if the env is set. No `AuditEvent` POST back to FHIR.

---

## Desk configuration (live)

```
name:    smart-fhir
command: node
args:    /workspace/smart-fhir-mcp/dist/index.js
env:
  FHIR_ISS        = https://launch.smarthealthit.org/v/r4/fhir
  FHIR_VERSION    = R4
  FHIR_AUTH_MODE  = open
  FHIR_WRITE      = off
  FHIR_AUDIT_PATH = /workspace/smart-fhir-mcp/audit/audit.jsonl
```

Same command is visible to this user's other agents. stdio only.

---

## Environment (no secrets in this sheet)

| Name | Desk today | Purpose |
| --- | --- | --- |
| `FHIR_ISS` | launcher R4 | Must stay allowlisted |
| `FHIR_VERSION` | `R4` | Reject anything else |
| `FHIR_AUTH_MODE` | `open` | `open` / `bearer` / `backend_jwt` |
| `FHIR_WRITE` | `off` | Writes stay off in v1 |
| `FHIR_AUDIT_PATH` | box audit JSONL | Append-only |
| `FHIR_ACCESS_TOKEN` | unset | Bearer only |
| `FHIR_CLIENT_ID` / `SMART_CLIENT_ID` | unset | Backend Services |
| `FHIR_PRIVATE_KEY_PEM` | unset | Backend Services JWT |
| `FHIR_JWKS_URL` | unset | If an EHR wants JWKS |
| `FHIR_SCOPE` | five `system/*.rs` types | JWT mode override |
| `FHIR_REDIRECT_URI` | unset | Reserved for later App Launch |

---

## Audit

Append-only JSONL. Create if missing. Never truncate.

Each line: `ts`, `tool`, `iss`, `mode`, `resourceType`, `id?`, `http_status`, `entry_count?`

No resource body. No token. No PEM. No name/MRN query values.

Sentinel Medium: file is `644` on the shared computer and stores synthetic ids. Not HIPAA. chmod 600 later if wanted.

---

## Verification (2026-08-24)

Critic PASS. Sentinel: may ship, no Critical/High.

| Check | Result |
| --- | --- |
| vitest | 18/18 |
| live prove vs launcher ISS | exit 0 |
| tools/list | four tools, no writes |
| `smart_discover` | `token_endpoint` = `https://launch.smarthealthit.org/v/r4/auth/token` |
| `fhir_search` Patient `_count=1` | searchset, runtime id (not hardcoded) |
| empty search | `total=0` |
| unknown id | 404 |
| DiagnosticReport | allowlist error |
| `example.com` ISS | refused |
| bad bearer | 401 |
| R5 / jwt-without-secrets / bad ISS start | exit 1 |
| Audit JSONL | no token, PEM, or body |

Proof file: `/workspace/smart-fhir-mcp/VERIFICATION.md`

---

## Out of v1

- FHIR R5 / R4B as the default
- Extra resource types (DiagnosticReport, AllergyIntolerance, …)
- Create / update / delete / Bulk / export
- App Launch browser + PKCE
- Live EHR, real PHI, production deploy, public HTTP
- Momentum fhir-mcp-server, fhirHydrant, Atrium, Pinecone, Medplum, Mini sot as a FHIR store
- GitHub repo `swami8791/smart-fhir-mcp` (needs a repo-create token)

---

## How to use from the desk

Ask Command Center to search or read a **synthetic** Patient, Observation, Condition, MedicationRequest, or Encounter on the public SMART launcher.

A later real ISS needs: the ISS URL, a SMART client_id, Sentinel review, then an env change. Do not point this at a live EHR without that.

---

## Source pack

| File | Path |
| --- | --- |
| This sheet | `/workspace/smart-fhir-mcp-spec/SPECS-SHEET.md` |
| Architect spec | `/workspace/smart-fhir-mcp-spec/SPEC.md` |
| Sentinel | `/workspace/smart-fhir-mcp-spec/SENTINEL.md` |
| Critic | `/workspace/smart-fhir-mcp-spec/CRITIC.md` |
| README | `/workspace/smart-fhir-mcp/README.md` |
| Verification | `/workspace/smart-fhir-mcp/VERIFICATION.md` |
