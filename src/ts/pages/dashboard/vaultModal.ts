import type { VaultCategory } from "../../utils/types";
import { uploadVault } from "../../utils/upload";
import type { UploadPayload } from "../../utils/upload";
import { fileIcon, uploadIcon, eyeIcon, eyeOffIcon } from "../../utils/icons";
import { esc } from "../../utils/format";
import { generatePassphrase, estimateStrength } from "../../utils/passphrase";
import type { PassphraseLang } from "../../utils/passphrase";
import { toast } from "../toast";

const MAX_FILE_SIZE_MB = 50;

type ModalDeps = {
  getUserId: () => string;
  reload: () => Promise<void>;
};

export function openModal(): void {
  const modal = document.getElementById("vault-modal")!;
  modal.classList.add("modal--open");
  modal.setAttribute("aria-hidden", "false");
  showFormView();
}

export function bindVaultModal(deps: ModalDeps): void {
  document.getElementById("new-vault-btn")!.addEventListener("click", openModal);
  document.getElementById("modal-close")!.addEventListener("click", closeModal);
  document.getElementById("modal-cancel")!.addEventListener("click", closeModal);
  document.getElementById("modal-backdrop")!.addEventListener("click", closeModal);
  document.getElementById("success-done")!.addEventListener("click", closeModal);

  const fileInput = document.getElementById("file-input") as HTMLInputElement;
  const fileLabel = document.getElementById("file-label")!;
  fileInput.addEventListener("change", () => showPickedFile(fileInput, fileLabel));

  const passInput = document.getElementById("passphrase") as HTMLInputElement;
  passInput.addEventListener("input", updateMeter);
  setToggleUI(false);

  document.getElementById("pass-generate")!.addEventListener("click", () => {
    const lang = (document.getElementById("pass-lang") as HTMLSelectElement).value as PassphraseLang;
    const phrase = generatePassphrase(lang);
    passInput.value = phrase;
    // Jangan ubah state lihat/sembunyi — biarkan seperti apa adanya.
    const confirm = document.getElementById("passphrase-confirm") as HTMLInputElement;
    confirm.value = phrase;
    updateMeter();
    toast("Frasa kuat dibuat — salin & bagikan di luar aplikasi", "success");
  });

  document.getElementById("pass-copy")!.addEventListener("click", async () => {
    await copyText(passInput.value, "Frasa disalin");
  });

  document.getElementById("pass-toggle")!.addEventListener("click", () => {
    const showing = passInput.type === "password";
    passInput.type = showing ? "text" : "password";
    setToggleUI(showing);
  });

  document.getElementById("success-copy")!.addEventListener("click", async () => {
    const phrase = document.getElementById("success-phrase")!.dataset.phrase ?? "";
    await copyText(phrase, "Frasa disalin — bagikan lewat jalur berbeda");
  });

  const form = document.getElementById("vault-form") as HTMLFormElement;
  form.addEventListener("submit", (e) => {
    void handleSubmit(e, fileInput, deps);
  });
}

function closeModal(): void {
  const modal = document.getElementById("vault-modal")!;
  const form = document.getElementById("vault-form") as HTMLFormElement;
  const label = document.getElementById("file-label")!;
  modal.classList.remove("modal--open");
  modal.setAttribute("aria-hidden", "true");
  form.reset();
  // Wipe sensitive UI state
  const successPhrase = document.getElementById("success-phrase")!;
  successPhrase.textContent = "";
  delete successPhrase.dataset.phrase;
  const passInput = document.getElementById("passphrase") as HTMLInputElement | null;
  if (passInput) passInput.type = "password";
  setToggleUI(false);
  showFormView();
  updateMeter();
  label.innerHTML = `
    ${uploadIcon(24)}
    <span>Klik untuk unggah atau seret &amp; lepas file ke sini</span>
  `;
}

function showPickedFile(fileInput: HTMLInputElement, fileLabel: HTMLElement): void {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileLabel.innerHTML = `
    ${fileIcon(20)}
    <span class="file-drop__filename">${esc(file.name)}</span>
  `;
}

function setToggleUI(visible: boolean): void {
  const btn = document.getElementById("pass-toggle") as HTMLButtonElement | null;
  if (!btn) return;
  btn.innerHTML = visible ? eyeOffIcon(16) : eyeIcon(16);
  btn.setAttribute("aria-label", visible ? "Sembunyikan frasa" : "Tampilkan frasa");
  btn.title = visible ? "Sembunyikan" : "Lihat";
}

function updateMeter(): void {
  const passInput = document.getElementById("passphrase") as HTMLInputElement | null;
  const bar = document.getElementById("pass-meter-bar") as HTMLElement | null;
  const label = document.getElementById("pass-strength-label") as HTMLElement | null;
  const entropyEl = document.getElementById("pass-entropy") as HTMLElement | null;
  const feedback = document.getElementById("pass-feedback") as HTMLElement | null;
  if (!passInput || !bar || !label || !entropyEl || !feedback) return;

  const v = passInput.value;
  if (!v) {
    bar.className = "pass-meter__bar";
    bar.style.width = "0%";
    label.textContent = "Belum ada frasa";
    entropyEl.textContent = "";
    feedback.innerHTML = "";
    return;
  }

  const r = estimateStrength(v);
  bar.className = `pass-meter__bar pass-meter__bar--l${r.level}`;
  bar.style.width = ["12%", "35%", "70%", "100%"][r.level];
  label.textContent = r.label;
  entropyEl.textContent = `~${r.entropyBits} bit · ${r.length} karakter · ${r.wordCount} kata`;
  feedback.innerHTML = r.reasons.map((m) => `<li>${esc(m)}</li>`).join("");
}

async function copyText(text: string, okMsg: string): Promise<void> {
  if (!text) {
    toast("Belum ada frasa untuk disalin", "warning");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, "success");
  } catch {
    // Fallback untuk browser tanpa clipboard permission
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast(okMsg, "success");
  }
}

async function handleSubmit(
  e: SubmitEvent,
  fileInput: HTMLInputElement,
  deps: ModalDeps,
): Promise<void> {
  e.preventDefault();

  const parsed = readForm(fileInput);
  if (!parsed) return;

  const submitBtn = document.getElementById("vault-submit") as HTMLButtonElement;
  setBusy(submitBtn, true);
  try {
    await uploadVault(parsed, deps.getUserId());
    showSuccessView(parsed.file.name, parsed.passphrase);
    await deps.reload();
  } catch (err) {
    console.error("upload error:", err);
    toast(err instanceof Error ? err.message : "Unggah gagal", "error");
  } finally {
    setBusy(submitBtn, false);
  }
}

function readForm(fileInput: HTMLInputElement): UploadPayload | null {
  const file = fileInput.files?.[0];
  const recipientEmail = (document.getElementById("recipient") as HTMLInputElement).value.trim();
  const deadlineDays = parseInt((document.getElementById("deadline") as HTMLSelectElement).value, 10);
  const passphrase = (document.getElementById("passphrase") as HTMLInputElement).value;
  const confirm = (document.getElementById("passphrase-confirm") as HTMLInputElement).value;
  const category = (document.getElementById("category") as HTMLSelectElement).value as VaultCategory;
  const shareOk = (document.getElementById("share-check") as HTMLInputElement).checked;

  if (!file || !recipientEmail || !passphrase) {
    toast("Semua kolom wajib diisi", "warning");
    return null;
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    toast(`File terlalu besar. Maksimal ${MAX_FILE_SIZE_MB}MB.`, "error");
    return null;
  }
  const strength = estimateStrength(passphrase);
  if (!strength.ok) {
    toast(
      strength.reasons[0] ?? "Frasa terlalu lemah — gunakan generator 6 kata.",
      "warning"
    );
    updateMeter();
    return null;
  }
  if (passphrase !== confirm) {
    toast("Konfirmasi frasa tidak cocok.", "warning");
    return null;
  }
  if (!shareOk) {
    toast("Centang pernyataan berbagi di luar aplikasi dulu.", "warning");
    return null;
  }
  return { file, recipientEmail, deadlineDays, passphrase, category };
}

function showFormView(): void {
  document.getElementById("vault-form")?.classList.remove("hidden");
  document.getElementById("vault-success")?.classList.add("hidden");
}

function showSuccessView(filename: string, passphrase: string): void {
  document.getElementById("vault-form")?.classList.add("hidden");
  const success = document.getElementById("vault-success")!;
  success.classList.remove("hidden");
  (document.getElementById("success-filename") as HTMLElement).textContent = `"${filename}"`;
  const phraseEl = document.getElementById("success-phrase")!;
  phraseEl.textContent = passphrase;
  phraseEl.dataset.phrase = passphrase;
  // Kosongkan input agar tidak tertinggal di DOM form
  (document.getElementById("passphrase") as HTMLInputElement).value = "";
  (document.getElementById("passphrase-confirm") as HTMLInputElement).value = "";
  updateMeter();
  toast("Vault tersimpan — salin frasa & bagikan di luar aplikasi", "success");
}

function setBusy(btn: HTMLButtonElement, busy: boolean): void {
  btn.disabled = busy;
  btn.classList.toggle("btn--loading", busy);
  btn.textContent = busy ? "" : "Enkripsi & simpan";
}
