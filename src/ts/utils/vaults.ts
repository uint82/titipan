import { supabase } from "./supabase";
import { logEvent } from "./audit";
import type { VaultRecord } from "./types";

export async function insertVault(vault: VaultRecord): Promise<void> {
  const { error } = await supabase.from("vaults").insert(vault);
  if (error) throw error;
}

export async function getVaultById(id: string): Promise<VaultRecord> {
  const { data, error } = await supabase
    .from("vaults")
    .select("id, original_filename, mime_type, released_at, wrapped_file_key, wrap_iv, file_iv, salt, storage_object_key")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as VaultRecord;
}

export async function getVaultsByUser(userId: string): Promise<VaultRecord[]> {
  const { data, error } = await supabase
    .from("vaults").select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VaultRecord[];
}

export async function checkinVault(id: string): Promise<void> {
  const { data: vault, error: fetchError } = await supabase
    .from("vaults")
    .select("deadline_days")
    .eq("id", id)
    .single();

  if (fetchError || !vault) throw fetchError ?? new Error("Vault not found");

  const now = new Date();
  const intervalDays = vault.deadline_days ?? 30;
  const newDeadline = new Date(now);
  newDeadline.setDate(newDeadline.getDate() + intervalDays);

  const { error } = await supabase
    .from("vaults")
    .update({
      last_checkin_at: now.toISOString(),
      deadline_at: newDeadline.toISOString(),
      reminder_7d_sent_at: null,
      reminder_1d_sent_at: null,
    })
    .eq("id", id);

  if (error) throw error;

  await logEvent(id, "checkin", {
    checked_in_at: now.toISOString(),
    new_deadline: newDeadline.toISOString(),
    interval_days: intervalDays,
  });
}

export async function deleteVault(id: string): Promise<void> {
  const { error } = await supabase.from("vaults").delete().eq("id", id);
  if (error) throw error;
}
