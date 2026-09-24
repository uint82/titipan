import type { EncryptedData, WrappedKeyData } from "./types";

export const AES_ALGORITHM = "AES-GCM";
export const PBKDF2_ALGORITHM = "PBKDF2";
export const HASH_ALGORITHM = "SHA-256";
export const AES_KEY_LENGTH = 256;
export const IV_LENGTH = 12;
export const SALT_LENGTH = 32; // NIST SP 800-132 recommends >= 32 bytes
export const PBKDF2_ITERATIONS = 250_000;

export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

export function generateIV(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

export function generateSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

export async function deriveMasterKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>
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
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    baseKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ["wrapKey", "unwrapKey"]
  );
}

export async function encryptFile(
  file: File,
  key: CryptoKey
): Promise<EncryptedData> {
  const iv = generateIV();
  const fileBuffer = await file.arrayBuffer();

  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    key,
    fileBuffer
  );

  return { ciphertext, iv };
}

export async function decryptFile(
  ciphertext: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv },
    key,
    ciphertext
  );
}

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
    true,
    ["encrypt", "decrypt"]
  );
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

export function uint8ToBase64(array: Uint8Array<ArrayBuffer>): string {
  return arrayBufferToBase64(array.buffer);
}

export function base64ToUint8(base64: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(base64ToArrayBuffer(base64)) as Uint8Array<ArrayBuffer>;
}
