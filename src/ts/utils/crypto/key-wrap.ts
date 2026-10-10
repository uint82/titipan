import type { WrappedKeyData } from "../types";
import { AES_ALGORITHM, AES_KEY_LENGTH } from "./constants";
import { generateIV } from "./random";

export async function wrapFileKey(
  fileKey: CryptoKey,
  masterKey: CryptoKey
): Promise<WrappedKeyData> {
  const iv = generateIV();

  const wrappedKey = await crypto.subtle.wrapKey(
    "raw",
    fileKey,
    masterKey,
    { name: AES_ALGORITHM, iv }
  );

  return { wrappedKey, iv };
}

export async function unwrapFileKey(
  wrappedKey: ArrayBuffer,
  masterKey: CryptoKey,
  iv: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    wrappedKey,
    masterKey,
    { name: AES_ALGORITHM, iv },
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}
