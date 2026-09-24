import { supabase } from "./supabase";

export type AuditEventType =
  | "vault_created"
  | "checkin"
  | "reminder_sent"
  | "deadline_missed"
  | "email_sent"
  | "verify_opened"
  | "decrypt_attempted"
  | "release_rollback";

export type AuditLog = {
  id: string;
  vault_id: string;
  event_type: AuditEventType;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function logEvent(
  vaultId: string,
  eventType: AuditEventType,
  metadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("audit_logs")
    .insert({
      vault_id: vaultId,
      event_type: eventType,
      metadata: metadata ?? null,
    });

  if (error) console.warn("audit log failed:", error.message);
}

export async function getAuditLogs(vaultId: string): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("vault_id", vaultId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AuditLog[];
}

export const EVENT_LABEL: Record<AuditEventType, string> = {
  vault_created: "File diupload dan dienkripsi",
  checkin: "Check-in dilakukan, deadline diperbarui",
  reminder_sent: "Email pengingat dikirim ke pemilik",
  deadline_missed: "Deadline terlewat, file dikirim ke recipient",
  email_sent: "Email dikirim ke recipient",
  verify_opened: "Recipient membuka halaman verifikasi",
  decrypt_attempted: "Recipient berhasil mendekripsi dan mengunduh file",
  release_rollback: "Pengiriman gagal, vault akan dicoba lagi",
};

export const EVENT_ICON_SVG: Record<AuditEventType, string> = {
  // lock/kunci
  vault_created: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,

  // linkaran centang
  checkin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,

  // notifikasi
  reminder_sent: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,

  // jam
  deadline_missed: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,

  // email
  email_sent: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,

  // mata
  verify_opened: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,

  // download
  decrypt_attempted: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,

  // warning/retry
  release_rollback: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>`,
};

// mapping warna
export const EVENT_COLOR: Record<AuditEventType, string> = {
  vault_created: "neutral",
  checkin: "success",
  reminder_sent: "warning",
  deadline_missed: "danger",
  email_sent: "neutral",
  verify_opened: "neutral",
  decrypt_attempted: "success",
  release_rollback: "danger",
};
