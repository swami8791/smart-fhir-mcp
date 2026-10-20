# Epic sandbox prove — progress log (2026-09-22)

Operator log for proving `smart-fhir-mcp` against the **Epic non-production** FHIR R4 sandbox with `FHIR_AUTH_MODE=backend_jwt`.

This is **not** a production EHR. This is **not** a medical product. No PHI from a live chart. No inventing patients or credentials. No secret values in this repo or in chat reports.

Repo: https://github.com/swami8791/smart-fhir-mcp
Related vendor doc: [SANDBOX-EMR.md](./SANDBOX-EMR.md)

## Goal

Prove live (against Epic sandbox only):

1. `smart_discover`
2. `fhir_auth_status` (token_present boolean only; never print token or PEM)
3. `fhir_search` / `fhir_read` on allowlisted resource types
4. Empty Bundle and 404 handled as success shapes (not invented resources)
5. Off-allowlist resourceType refused
6. Audit JSONL clean (no bodies, tokens, PEM, names, MRNs)

## Target lock

| Setting | Value |
| --- | --- |
| ISS | `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4` |
| FHIR_VERSION | `R4` |
| FHIR_AUTH_MODE | `backend_jwt` |
| FHIR_WRITE | `off` |
| Client | **Non-production** Backend Systems client only (never Production client id) |
| Portal | https://fhir.epic.com |

Production Interconnect hosts stay refused (see allowlist tests on `main`).

## Env required for live prove (local only; never commit)

```
FHIR_ISS=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
FHIR_VERSION=R4
FHIR_AUTH_MODE=backend_jwt
FHIR_WRITE=off
FHIR_CLIENT_ID=<non-production client id from Epic portal / 1Password>
FHIR_PRIVATE_KEY_PEM=<PKCS#8 PEM matching uploaded JWKS>
FHIR_JWT_KID=<kid matching the public JWK>
FHIR_AUDIT_PATH=./audit/audit.jsonl
```

Generate keys with `npm run keygen` (or `scripts/make-backend-key.mjs`). Upload printed `jwks` to the non-production Backend Systems app. Keep PEM out of git and chat.

## Chronology (desk, 2026-09-22 America/Chicago)

### Done

| Step | Status | Notes |
| --- | --- | --- |
| Build / unit tests on `main` | GREEN | Commit `bc638b1` — install, build, tests pass (22). Cloud agent `bc-1dae87be-71f1-5b3e-b43d-0f704e981ce2`. No code PR needed for that pass. |
| Vendor sandbox ISS + JWT kid on `main` | GREEN | Earlier commits: sandbox EMR path, Epic/Oracle sandbox ISS, refuse production ISS, `FHIR_JWT_KID` required for `backend_jwt`. |
| Credentials source | READY | 1Password share item **Epic on FHIR** has portal login + Non-Production / Production client ids in notes. Desk uses **Non-Production only**. |
| Non-production client id | IN LOCAL ENV | Stored only in operator local env / secret store. Never committed. Never printed in chat. |
| Keygen | DONE | Local key pair generated. Public JWKS prepared for Epic upload. |
| Public kid (safe to publish) | `9f82d33f-e4fb-4c74-90bb-eb89dd216460` | Must match JWKS uploaded to Epic and `FHIR_JWT_KID` in local env. |
| Scope decision | LOCKED | Finish Epic sandbox prove **before** any sell motion. Sellability vs OneDay "buy in 90 days" stays **No** until there is a buyable offer and preferably a live Epic receipt. |

### In progress / blocked on human

| Step | Status | Owner |
| --- | --- | --- |
| Upload JWKS to non-production Backend Systems app at fhir.epic.com | WAITING | Nehal |
| Epic JWKS sync delay | EXPECTED | Early 401s after upload can be normal; retry after short wait |
| Live runbook prove (discover → auth status → search/read → empty/404 → allowlist refuse → audit) | NOT STARTED | Desk after upload confirm |
| Structured prove report (statuses only; no resource bodies; no secrets) | NOT STARTED | Desk |

### Explicitly out of scope for this prove

- Production Epic ISS or Production client id
- FHIR writes / create / update / delete
- Invented Patient / Observation / other resources
- App Launch (code + PKCE)
- Committing PEM, client id, access tokens, or `.env`
- Pointing the connector at a customer live Interconnect

## Live prove order (when JWKS is uploaded)

1. Confirm JWKS saved on non-production Backend Systems app; kid matches.
2. Load local env (never echo secrets).
3. Run prove script / MCP tools in order above against Epic sandbox ISS only.
4. Capture report fields: tool name, http_status or ok/error shape, `token_present` boolean, empty/404/allowlist outcomes, audit line counts. **No** resource bodies, **no** tokens, **no** PEM, **no** client id.
5. If token endpoint 401 shortly after upload, wait and retry once before declaring fail.

## Report template (fill after live run)

```
Date (America/Chicago):
Commit SHA:
ISS: https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
Mode: backend_jwt
Write: off

smart_discover: <ok|fail> <http_status?>
fhir_auth_status: mode=backend_jwt token_present=<true|false> discovery_ok=<true|false>
fhir_search (Patient or allowlisted type): <ok|fail> <http_status?> empty_bundle=<yes|no|n/a>
fhir_read known-missing id: <404 expected|other>
resourceType off-allowlist: <refused as expected|other>
audit.jsonl: lines_added=<n> secrets_in_audit=<none|FAIL>

Overall: PASS | FAIL | BLOCKED
Blocker (if any):
```

## Desk notes

- Command Center owns operator coordination. Secrets stay on the operator machine / 1Password; never in git.
- Local checkout on the desk machine can lag `main`; prefer `gh` / cloud agent for code. Secrets stay in a separate local prove dir (for example outside the git tree or gitignored).
- README still describes public synthetic sandboxes as the default morning path; vendor sandbox EMR is documented in [SANDBOX-EMR.md](./SANDBOX-EMR.md) and gated by ISS allowlist + Sentinel rules.

## Next action

1. Nehal: confirm JWKS uploaded and saved on the **non-production** Backend Systems app.
2. Desk: run live prove + fill report template above.
