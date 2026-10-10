import { AES_ALGORITHM, AES_KEY_LENGTH, IV_LENGTH, SALT_LENGTH } from "./constants";

export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true, // wajib true: WebCrypto menolak wrapKey atas kunci non-extractable
    ["encrypt", "decrypt"]
  );
}

export function generateIV(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

export function generateSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}
