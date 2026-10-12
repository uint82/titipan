import { ID_WORDS } from "./wordlist-id";
import { EN_WORDS } from "./wordlist-en";

export type PassphraseLang = "id" | "en";

export const WORD_COUNTS: Record<PassphraseLang, number> = { id: 7, en: 6 };
export const ENTROPY_BITS: Record<PassphraseLang, number> = {
  id: Math.round(WORD_COUNTS.id * Math.log2(ID_WORDS.length)),
  en: Math.round(WORD_COUNTS.en * Math.log2(EN_WORDS.length)),
};

export function generatePassphrase(lang: PassphraseLang = "id"): string {
  const list = lang === "id" ? ID_WORDS : EN_WORDS;
  const n = WORD_COUNTS[lang];
  const rand = new Uint32Array(n);
  crypto.getRandomValues(rand);
  const words: string[] = [];
  for (let i = 0; i < n; i++) words.push(list[rand[i] % list.length]);
  return words.join("-");
}
