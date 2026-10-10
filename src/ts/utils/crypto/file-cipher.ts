import type { EncryptedData } from "../types";
import { AES_ALGORITHM } from "./constants";
import { generateIV } from "./random";

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
