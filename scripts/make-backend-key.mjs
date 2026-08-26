#!/usr/bin/env node
/** Generate a local RSA-2048 key + public JWKS. Prints to stdout. Never commit the PEM. */
import { generateKeyPairSync, randomUUID } from "node:crypto";

const kid = process.env.FHIR_JWT_KID || randomUUID();
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "jwk" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const jwk = {
  kty: publicKey.kty,
  n: publicKey.n,
  e: publicKey.e,
  kid,
  use: "sig",
  alg: "RS384",
};

process.stdout.write(
  JSON.stringify(
    {
      kid,
      jwks: { keys: [jwk] },
      private_key_pem: privateKey,
      note: "Upload jwks to the vendor sandbox. Put private_key_pem in FHIR_PRIVATE_KEY_PEM locally. Do not commit.",
    },
    null,
    2,
  ) + "\n",
);
