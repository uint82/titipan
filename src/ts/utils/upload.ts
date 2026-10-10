import {
  generateAESKey, generateSalt, deriveMasterKey,
  encryptFile, encryptString, wrapFileKey,
  arrayBufferToBase64, uint8ToBase64,
  PBKDF2_ITERATIONS,
} from "../utils/crypto";
import { uploadEncryptedFile } from "../utils/storage";
import { insertVault } from "../utils/vaults";
import { logEvent } from "../utils/audit";
import type { VaultRecord, VaultCategory } from "../utils/types";

export type UploadPayload = {
  file: File;
  recipientEmail: string;
  deadlineDays: number;
  passphrase: string;
  category: VaultCategory;
};

export async function uploadVault(
  payload: UploadPayload,
  userId: string
): Promise<VaultRecord> {
  const { file, recipientEmail, deadlineDays, passphrase, category } = payload;

  const fileKey = await generateAESKey();
  const salt = generateSalt();
  const masterKey = await deriveMasterKey(passphrase, salt);

  const { ciphertext, iv: fileIv } = await encryptFile(file, fileKey);
  const { wrappedKey, iv: wrapIv } = await wrapFileKey(fileKey, masterKey);
  const { ciphertext: encName, iv: nameIv } = await encryptString(file.name, fileKey);

  const storagePath = `encrypted/${userId}/${crypto.randomUUID()}.bin`;
  await uploadEncryptedFile(storagePath, ciphertext);

  const now = new Date();
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + deadlineDays);

  const vault: VaultRecord = {
    id: crypto.randomUUID(),
    user_id: userId,
    storage_object_key: storagePath,
    wrapped_file_key: arrayBufferToBase64(wrappedKey),
    wrap_iv: uint8ToBase64(wrapIv as Uint8Array<ArrayBuffer>),
    file_iv: uint8ToBase64(fileIv as Uint8Array<ArrayBuffer>),
    salt: uint8ToBase64(salt),
    kdf_iterations: PBKDF2_ITERATIONS,
    original_filename: null,
    enc_filename: arrayBufferToBase64(encName),
    filename_iv: uint8ToBase64(nameIv as Uint8Array<ArrayBuffer>),
    mime_type: file.type,
    recipient_email: recipientEmail,
    deadline_at: deadline.toISOString(),
    deadline_days: deadlineDays,
    last_checkin_at: now.toISOString(),
    released_at: null,
    created_at: now.toISOString(),
    category,
  };

  await insertVault(vault);

  await logEvent(vault.id, "vault_created", {
    size_bytes: file.size,
    deadline_days: deadlineDays,
    category,
  });

  return vault;
}
