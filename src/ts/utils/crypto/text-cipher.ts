import { AES_ALGORITHM } from "./constants";
import { generateIV } from "./random";

export type EncryptedText = {
  ciphertext: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
};

export async function encryptString(
  text: string,
  key: CryptoKey
): Promise<EncryptedText> {
  const iv = generateIV();
  const data = new TextEncoder().encode(text);

  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    key,
    data
  );

  return { ciphertext, iv };
}

export async function decryptString(
  ciphertext: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plain);
}
