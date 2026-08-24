# SENTINEL — SMART on FHIR MCP v1

**Date:** 2026-08-24  
**Reviewer:** Sentinel  
**Bar:** Public synthetic sandbox only. Not a live EHR. Not KeepAfter. Not a medical product.  
**Did:** Read SPEC, ACCEPTANCE, src, dist/index.js exists. Re-ran vitest (18/18) and start rejects (R5, bad ISS, jwt-missing → exit 1). Did not take Builder’s word. Did not AddMcpServer. Did not implement. Did not ping Nehal or CC.  
**Did not:** need a real EHR or Nehal secrets.

## Ship decision

**Morning v1 may ship** as a **local stdio** desk add against the **allowlisted public sandboxes only**.

No Critical or High. Desk add is CC’s confirm, not mine. I did not add the connector.

Any ISS not on the v1 allowlist is a later lock + this review again. Live EHR / real PHI is out.

## Evidence vs assumption vs hypothesis

**Evidence**
- stdio only (`StdioServerTransport`). No `listen` / `createServer` / bind in `src/`.
- `FHIR_VERSION` must be `R4`. I re-ran: `FHIR_VERSION=R5` → exit 1.
- ISS allowlist exact (slash-stripped): launcher R4, `r4.smarthealthit.org`, `hapi.fhir.org/baseR4`. Per-call `iss` uses the same check. `https://example.com/fhir` start and tool → refused.
- Modes: `open` (default, no Authorization), `bearer` (env token, 401 is `ok: false`), `backend_jwt` refuses to start without `FHIR_CLIENT_ID` + `FHIR_PRIVATE_KEY_PEM`. Does not invent them.
- JWT scopes default `system/{Patient,Observation,Condition,MedicationRequest,Encounter}.rs`. Token request uses `FHIR_SCOPE` or that default. Path unused this morning.
- Four GET tools. No create/update/delete. `config.write` is always `"off"` even if `FHIR_WRITE` is set.
- Search/read return server JSON or explicit error. No synthetic Patient. Empty Bundle and 404 paths exist in code + Builder’s live prove (I did not re-fetch the sandbox).
- Audit: append-only JSONL, keys `ts,tool,iss,mode,resourceType,id?,http_status,entry_count?`. 22 lines on disk, 0 with token/PEM/body. `.gitignore` includes `audit/audit.jsonl`.
- File mode `audit/audit.jsonl` is `644` on the shared box.

**Assumption**
- Sandbox Patients stay synthetic (Synthea). Not re-classified as PHI.

**Hypothesis**
- None needed to ship morning open mode.

## Findings

None Critical. None High.

Medium | Shared-box `audit/audit.jsonl` | Any agent on this computer can read resource ids | Desk is one shared machine; audit is world-readable and stores `id` | chmod 600, or put the file in an agent-private path. Rotation later if the file grows. Synthetic ids only today. | access control on a shared host — not HIPAA

Medium | `backend_jwt` token_endpoint | Discovery JSON picks the token URL | When JWT is actually used, a weird `token_endpoint` on an allowlisted ISS would receive the client assertion | Pin token URL to same ISS host before using JWT. Morning path unused. | SMART Backend Services

Low | Unbounded audit append | File growth / disk | Desk experiment, low volume | Rotate or cap later | operational

Low | `FHIR_WRITE=on` starts anyway | Writes still off (no tools) | Confusing env | Keep refuse-to-start or ignore; v1 has no write tools either way | —

Low | `VERIFICATION.md` embeds full sandbox Patient JSON | Shared-box copy of Synthea rows | Fine as a prove log. Do not treat as real PHI. Don’t publish that file as if it were a live EHR dump. | residual

HIPAA / SOC 2 do **not** apply to this public synthetic desk tool. I am not certifying anything. A later real ISS is a different review.

## Auth / scopes / PHI (checklist)

| Check | Result |
| --- | --- |
| SMART discovery | Implemented. Open-mode 404 is not fatal. Does not invent endpoints. |
| open / bearer / backend_jwt stub | As specified. JWT does not run without both envs. |
| Scopes | Default five `system/*.rs`. Only on JWT token POST. |
| ISS allowlist | Start + per-tool. Off-list refused. |
| Audit | Append-only. No token, PEM, resource body. |
| Invented Patient | No. 401/404/empty explicit. |
| Writes | Off. No write tools. |
| Public HTTP port | None. |
| Second cloud DB | None. |
| FHIR R4 only | R5/R4B start fail. |
| Shared-box audit | Readable by all agents; ids only; see Medium. |

## Residual for later locks

- Any new ISS → stop, lock, Sentinel again.
- Storing a real token or PEM → Sentinel again. Do not commit them. `.env` is gitignored.
- App Launch / PKCE / browser → out of v1.
- Calling this a medical product or wiring KeepAfter → out.

## Decision

**May ship morning v1** (public sandbox, stdio, writes off). **No desk add from me.** No Critical/High. Escalation: none.
