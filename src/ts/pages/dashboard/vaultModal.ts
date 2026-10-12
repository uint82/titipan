import type { VaultCategory } from "../../utils/types";
import { uploadVault } from "../../utils/upload";
import type { UploadPayload } from "../../utils/upload";
import { fileIcon, uploadIcon, eyeIcon, eyeOffIcon } from "../../utils/icons";
import { esc } from "../../utils/format";
import { generatePassphrase } from "../../utils/passphrase";
import type { PassphraseLang } from "../../utils/passphrase";
import { toast } from "../toast";

const MAX_FILE_SIZE_MB = 50;

type ModalDeps = {
  getUserId: () => string;
  reload: () => Promise<void>;
};

let generatedPhrase = "";

export function openModal(): void {
  const modal = document.getElementById("vault-modal")!;
  modal.classList.add("modal--open");
  modal.setAttribute("aria-hidden", "false");
  showFormView();
  autoFillPhrase();
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
  setToggleUI(false);

  document.getElementById("pass-generate")!.addEventListener("click", () => {
    const lang = (document.getElementById("pass-lang") as HTMLSelectElement).value as PassphraseLang;
    generatedPhrase = generatePassphrase(lang);
    passInput.value = generatedPhrase;
    toast("Frasa kuat dibuat - salin & bagikan di luar aplikasi", "success");
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
    await copyText(phrase, "Frasa disalin - bagikan lewat jalur berbeda");
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
  generatedPhrase = "";
  const successPhrase = document.getElementById("success-phrase")!;
  successPhrase.textContent = "";
  delete successPhrase.dataset.phrase;
  const passInput = document.getElementById("passphrase") as HTMLInputElement | null;
  if (passInput) passInput.type = "password";
  setToggleUI(false);
  showFormView();
  label.innerHTML = `
    ${uploadIcon(24)}
    <span>Klik untuk unggah atau seret &amp; lepas file ke sini</span>
  `;
}

function autoFillPhrase(): void {
  const lang = (document.getElementById("pass-lang") as HTMLSelectElement).value as PassphraseLang;
  generatedPhrase = generatePassphrase(lang);
  (document.getElementById("passphrase") as HTMLInputElement).value = generatedPhrase;
}

function showPickedFile(fileInput: HTMLInputElement, fileLabel: HTMLElement): void {  const file = fileInput.files?.[0];
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

async function copyText(text: string, okMsg: string): Promise<void> {
  if (!text) {
    toast("Belum ada frasa untuk disalin", "warning");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, "success");
  } catch {
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
  if (passphrase !== generatedPhrase) {
    toast("Klik Buatkan yang kuat dulu - frasa manual tidak diterima.", "warning");
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
  (document.getElementById("passphrase") as HTMLInputElement).value = "";
  generatedPhrase = "";
  toast("Vault tersimpan - salin frasa & bagikan di luar aplikasi", "success");
}

function setBusy(btn: HTMLButtonElement, busy: boolean): void {
  btn.disabled = busy;
  btn.classList.toggle("btn--loading", busy);
  btn.textContent = busy ? "" : "Enkripsi & simpan";
}
