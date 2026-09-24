export type EncryptedData = {
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
};

export type WrappedKeyData = {
  wrappedKey: ArrayBuffer;
  iv: Uint8Array;
};

export type VaultCategory =
  | "pesan_pribadi"
  | "keuangan_aset"
  | "dokumen_hukum"
  | "sensitif"
  | "kredensial"
  | "bisnis"
  | "lainnya";

export type VaultRecord = {
  id: string;
  user_id?: string;
  storage_object_key: string;
  wrapped_file_key: string;
  wrap_iv: string;
  file_iv: string;
  salt: string;
  original_filename?: string;
  mime_type?: string;
  recipient_email?: string;
  deadline_at?: string;
  deadline_days?: number;
  last_checkin_at?: string;
  released_at?: string | null;
  created_at: string;
  reminder_7d_sent_at?: string | null;
  reminder_1d_sent_at?: string | null;
  category: VaultCategory;
};

export const CATEGORY_LABEL: Record<VaultCategory, string> = {
  pesan_pribadi: "Pesan Pribadi",
  keuangan_aset: "Keuangan & Aset",
  dokumen_hukum: "Dokumen Hukum",
  sensitif: "Sensitif",
  kredensial: "Kredensial",
  bisnis: "Bisnis",
  lainnya: "Lainnya",
};

export const CATEGORY_ICON: Record<VaultCategory, string> = {
  pesan_pribadi: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  keuangan_aset: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  dokumen_hukum: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  sensitif: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  kredensial: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  bisnis: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  lainnya: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

export const CATEGORY_COLOR: Record<VaultCategory, string> = {
  pesan_pribadi: "purple",
  keuangan_aset: "green",
  dokumen_hukum: "blue",
  sensitif: "red",
  kredensial: "orange",
  bisnis: "teal",
  lainnya: "gray",
};
