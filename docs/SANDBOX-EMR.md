# Vendor sandbox EMR (not production)

Backend Services only. App Launch is still out. Writes stay off. No live chart.

## Allowlisted vendor ISS

- Epic sandbox R4: `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4`
- Oracle Health open sandbox: `https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d`
- Oracle Health secure sandbox: `https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d`

Production hosts (`fhir-ehr.cerner.com`, customer Epic Interconnect) stay refused.

## You must register

This repo cannot mint an Epic/Oracle `client_id`. Register a **Backend Systems** app yourself:

1. Epic: https://fhir.epic.com — non-production client id, upload JWKS.
2. Oracle: code Console sandbox app for tenant `ec2458f2-1e24-41c8-b71b-0e701af7583d`.

## Local env (never commit)

```
FHIR_ISS=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
FHIR_VERSION=R4
FHIR_AUTH_MODE=backend_jwt
FHIR_WRITE=off
FHIR_CLIENT_ID=<non-production client id>
FHIR_PRIVATE_KEY_PEM=<pkcs8 pem>
FHIR_JWT_KID=<kid in uploaded JWK>
FHIR_AUDIT_PATH=./audit/audit.jsonl
```

Generate a key locally:

```bash
npm run keygen
```

Upload the printed `jwks` to the sandbox. Keep the PEM out of git.

Oracle open sandbox can stay `FHIR_AUTH_MODE=open` (read-only, no token).
