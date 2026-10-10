import {
  AES_ALGORITHM,
  AES_KEY_LENGTH,
  HASH_ALGORITHM,
  PBKDF2_ALGORITHM,
  PBKDF2_ITERATIONS,
} from "./constants";

export async function deriveMasterKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: PBKDF2_ALGORITHM,
      salt,
      iterations,
      hash: HASH_ALGORITHM,
    },
    baseKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ["wrapKey", "unwrapKey"]
  );
}
