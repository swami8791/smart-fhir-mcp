# Critic — SMART on FHIR MCP v1

**Date:** 2026-08-24  
**Reviewer:** Critic  
**Home:** `/workspace/smart-fhir-mcp`  
**Spec / bars:** `SPEC.md`, `ACCEPTANCE.md` 1–14  
**Proved this turn:** `npx vitest run` (18 passed); `FHIR_VERSION=R5` / `backend_jwt` missing env / bad ISS start rejects; `node scripts/prove.mjs` exit 0 (live stdio against the default launcher). Audit file scanned. Source read (`index.ts`, `tools.ts`, `config.ts`, `fhir-client.ts`, `audit.ts`, `types.ts`).

Did not take Builder’s word. Did not AddMcpServer. Did not implement.

## Verdict

**PASS**

No Critical. No Major. Morning-ready: real command results exist from this review, not only a claim. Item 13 (desk AddMcpServer) is documented-not-executed by instruction — not a fail.

## Acceptance

| # | Bar | Result |
| --- | --- | --- |
| 1 | Home not KeepAfter / not hermes-os | **Met.** `/workspace/smart-fhir-mcp`. Those trees are not parents. README states it is neither product. |
| 2 | FHIR R4 only; official index is R5 landing, not implemented | **Met.** `FHIR_VERSION=R5` → exit 1, cites http://hl7.org/fhir/ as R5 landing. |
| 3 | stdio MCP; no marketplace plugin; no public HTTP port | **Met.** `StdioServerTransport`. No listen/bind in src. |
| 4 | `smart_discover` default ISS includes `token_endpoint` | **Met.** This review: `https://launch.smarthealthit.org/v/r4/auth/token`. |
| 5 | Open `fhir_search` Patient `_count=1` → searchset or explicit error; no minted Patient | **Met.** Live Bundle `type=searchset`. |
| 6 | Allowlist five types; sixth is tool error | **Met.** `DiagnosticReport` → `resourceType not in v1 allowlist`. |
| 7 | Empty search / 404 do not invent a Patient | **Met.** `name=ZZZNOMATCH999` → Bundle `total: 0`, no `entry`. Unknown id → `{ ok:false, http_status:404 }`. |
| 8 | Bad token / 401 → `ok:false` + status; no fake row | **Met.** Bearer `not-a-real-token` → `http_status:401`. |
| 9 | Writes off; no create/update/delete tools | **Met.** `tools/list` is exactly four names. `write` forced `"off"`. Only HTTP POST is the token endpoint. |
| 10 | Audit JSONL; no token / PEM / body | **Met.** 22+ lines scanned; keys only `ts,tool,iss,mode,resourceType,id,http_status,entry_count`. |
| 11 | ISS allowlist; other ISS refused | **Met.** `https://example.com/fhir` → `ISS not in v1 allowlist`. Start with that ISS exits 1. |
| 12 | No Nehal secrets; `backend_jwt` without env does not run or invent | **Met.** Start exit 1: requires `FHIR_CLIENT_ID` and `FHIR_PRIVATE_KEY_PEM`. |
| 13 | Desk AddMcpServer | **Documented-not-executed** (README + SPEC). Not a fail. |
| 14 | Out: no R5 resources, no real EHR, no PHI store, no production, no money, no public post | **Met.** Allowlist + public sandboxes only. Not a medical product. |

## tools/list (this review)

Four tools, no writes: `smart_discover`, `fhir_auth_status`, `fhir_search`, `fhir_read`.

## Defects vs preferences

No blocking defects.

**Preference:** `FHIR_WRITE` other than `off` still starts if the ISS is allowlisted; `write` stays `"off"` and there are still no write tools. Matches SPEC, not a sixth tool.

**Preference:** `resourceType` is a string in the MCP schema; allowlist is enforced in the handler. Fine if the handler stays first.

## UNVERIFIED — do not treat as true

1. Command Center has added the connector on the Grok desk (item 13 not executed).  
2. This is a medical product or a KeepAfter / hermes-os feature (it is not).  
3. A live EHR or real PHI is in scope (it is not).  
4. R5 is implemented (it is not).  
5. `backend_jwt` works without a real client_id + PEM (start refuses).  
6. Audit is authorization (it is a local log).

## What this PASS does *not* authorize

AddMcpServer from this review. A fourth ISS. Writes. App Launch. Real EHR. Putting this inside KeepAfter or hermes-os. Calling it a medical product.
