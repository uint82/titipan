import type { VaultCategory } from "../../utils/types";
import { uploadVault } from "../../utils/upload";
import type { UploadPayload } from "../../utils/upload";
import { fileIcon, uploadIcon } from "../../utils/icons";
import { esc } from "../../utils/format";
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
}

export function bindVaultModal(deps: ModalDeps): void {
  document.getElementById("new-vault-btn")!.addEventListener("click", openModal);
  document.getElementById("modal-close")!.addEventListener("click", closeModal);
  document.getElementById("modal-cancel")!.addEventListener("click", closeModal);
  document.getElementById("modal-backdrop")!.addEventListener("click", closeModal);

  const fileInput = document.getElementById("file-input") as HTMLInputElement;
  const fileLabel = document.getElementById("file-label")!;
  fileInput.addEventListener("change", () => showPickedFile(fileInput, fileLabel));

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
    toast(`"${parsed.file.name}" terenkripsi dan tersimpan`, "success");
    closeModal();
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

  if (!file || !recipientEmail || !passphrase) {
    toast("Semua kolom wajib diisi", "warning");
    return null;
  }
  if (passphrase.length < 12) {
    toast("Frasa sandi minimal 12 karakter.", "warning");
    return null;
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    toast(`File terlalu besar. Maksimal ${MAX_FILE_SIZE_MB}MB.`, "error");
    return null;
  }
  return { file, recipientEmail, deadlineDays, passphrase, category };
}

function setBusy(btn: HTMLButtonElement, busy: boolean): void {
  btn.disabled = busy;
  btn.classList.toggle("btn--loading", busy);
  btn.textContent = busy ? "" : "Enkripsi & simpan";
}
