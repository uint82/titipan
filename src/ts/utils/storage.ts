import { supabase } from "./supabase";

// tugas: encrypted blob I/O only.
// cuman tau path sama raw byte
// file ini nggk tau arti byte, gimana file di encrypte, atau metadata yang lain.

export async function uploadEncryptedFile(
  path: string,
  ciphertext: ArrayBuffer
): Promise<string> {
  const blob = new Blob([ciphertext], { type: "application/octet-stream" });

  const { data, error } = await supabase.storage
    .from("vaults")
    .upload(path, blob, { contentType: "application/octet-stream" });

  if (error) throw error;
  return data.path;
}

export async function downloadEncryptedFile(path: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from("vaults")
    .download(path);

  if (error) throw error;
  return data.arrayBuffer();
}

export async function deleteStorageFile(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from("vaults")
    .remove([path]);

  if (error) throw error;
}
