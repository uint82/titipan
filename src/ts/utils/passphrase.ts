// Generator + penilai kekuatan frasa sandi.
// ID_WORDS: 2048 kata (11 bit/kata) -> 6 kata = 66 bit.
// EN_WORDS (EFF large): 7776 kata (12.9 bit/kata) -> 6 kata = ~77 bit.
// Semua memakai crypto.getRandomValues (CSPRNG browser).

import { ID_WORDS } from "./wordlist-id";
import { EN_WORDS } from "./wordlist-en";

export type PassphraseLang = "id" | "en";

export const WORD_COUNTS: Record<PassphraseLang, number> = { id: 6, en: 6 };
export const ENTROPY_BITS: Record<PassphraseLang, number> = {
  id: Math.round(6 * Math.log2(ID_WORDS.length)),
  en: Math.round(6 * Math.log2(EN_WORDS.length)),
};

// Batas blokir: entropi charset minimal + panjang minimal.
// 60 bit ≈ di luar jangkauan brute-force online & mahal offline dengan PBKDF2-250k.
export const MIN_ENTROPY_BITS = 60;
export const MIN_LENGTH = 16;

const BLOCKLIST = [
  "password",
  "passphrase",
  "123456",
  "12345678",
  "qwerty",
  "abc123",
  "titipan",
  "indonesia",
  "bismillah",
  "assalamu",
  "tanggal",
  "lahir",
  "sayang",
  "cinta",
  "rahasia",
  "dokumen",
  "vault",
  "selamat",
  "merdeka",
  "garuda",
];

export function generatePassphrase(lang: PassphraseLang = "id"): string {
  const list = lang === "id" ? ID_WORDS : EN_WORDS;
  const n = WORD_COUNTS[lang];
  const rand = new Uint32Array(n);
  crypto.getRandomValues(rand);
  const words: string[] = [];
  for (let i = 0; i < n; i++) words.push(list[rand[i] % list.length]);
  return words.join("-");
}

export type StrengthLevel = 0 | 1 | 2 | 3;

export type StrengthResult = {
  level: StrengthLevel; // 0 lemah, 1 sedang, 2 kuat, 3 sangat kuat
  label: string;
  entropyBits: number;
  wordCount: number;
  length: number;
  ok: boolean; // boleh dipakai upload?
  reasons: string[];
};

function charsetPoolSize(s: string): number {
  let pool = 0;
  if (/[a-z]/.test(s)) pool += 26;
  if (/[A-Z]/.test(s)) pool += 26;
  if (/[0-9]/.test(s)) pool += 10;
  if (/[^a-zA-Z0-9\s\-_]/.test(s)) pool += 32;
  if (/[\s\-_]/.test(s)) pool += 4; // separator menambah sedikit ruang
  return pool || 26;
}

export function estimateStrength(passphrase: string): StrengthResult {
  const s = passphrase ?? "";
  const length = s.length;
  const wordCount = s.trim() === "" ? 0 : s.trim().split(/[\s\-_]+/).filter(Boolean).length;
  const reasons: string[] = [];

  const lower = s.toLowerCase();
  const blockHit = BLOCKLIST.find((b) => lower.includes(b));
  if (blockHit) reasons.push(`Mengandung pola umum (“${blockHit}”) - mudah ditebak.`);

  if (length < MIN_LENGTH) reasons.push(`Minimal ${MIN_LENGTH} karakter (saat ini ${length}).`);
  if (wordCount > 0 && wordCount < 4) reasons.push("Gunakan minimal 4 kata acak.");

  // Pola lemah: pengulangan / urutan sederhana
  if (/(.)\1{3,}/.test(s)) reasons.push("Hindari huruf berulang (mis. “aaaa”).");
  if (/^(123+|abc+|qwe+)/i.test(s.replace(/[\s\-_]/g, ""))) reasons.push("Hindari awalan berurutan.");

  const pool = charsetPoolSize(s);
  const entropyBits = Math.round(length * Math.log2(pool));

  let level: StrengthLevel = 0;
  let label = "Lemah";
  if (entropyBits >= 80 && !blockHit && length >= MIN_LENGTH) {
    level = 3;
    label = "Sangat kuat";
  } else if (entropyBits >= MIN_ENTROPY_BITS && !blockHit && length >= MIN_LENGTH) {
    level = 2;
    label = "Kuat";
  } else if (entropyBits >= 40 && length >= 12) {
    level = 1;
    label = "Sedang";
  }

  // Frasa hasil generator selalu dianggap kuat (entropi terukur).
  // Deteksi heuristik: 5-7 kata dari wordlist kami.
  if (wordCount >= 5 && length >= 20 && !blockHit && level < 2) {
    level = 2;
    label = "Kuat";
  }

  const ok = level >= 2 && !blockHit && length >= MIN_LENGTH;
  if (!ok && reasons.length === 0) {
    reasons.push(`Butuh entropi ≥ ${MIN_ENTROPY_BITS} bit - coba generator 6 kata di bawah.`);
  }

  return { level, label, entropyBits, wordCount, length, ok, reasons };
}

export function describeGenerator(lang: PassphraseLang): string {
  return lang === "id"
    ? `6 kata acak Indonesia (~${ENTROPY_BITS.id} bit)`
    : `6 kata acak Inggris EFF (~${ENTROPY_BITS.en} bit)`;
}
