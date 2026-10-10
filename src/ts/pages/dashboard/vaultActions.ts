import { checkinVault, deleteVault } from "../../utils/vaults";
import { deleteStorageFile } from "../../utils/storage";
import {
  deriveMasterKey, unwrapFileKey, decryptString,
  base64ToArrayBuffer, base64ToUint8,
  LEGACY_KDF_ITERATIONS,
} from "../../utils/crypto";
import type { VaultRecord } from "../../utils/types";
import { setRevealedName } from "./vaultView";
import { toast } from "../toast";

type ActionDeps = {
  reload: () => Promise<void>;
  showActivity: (id: string) => void;
  getVault: (id: string) => VaultRecord | undefined;
};

export function bindVaultActions(deps: ActionDeps): void {
  document.getElementById("vault-grid")!
    .addEventListener("click", (e) => {
      void handleGridClick(e, deps);
    });
}

async function handleGridClick(e: MouseEvent, deps: ActionDeps): Promise<void> {
  const btn = (e.target as Element).closest("[data-action]") as HTMLElement | null;
  if (!btn) return;

  const card = btn.closest("[data-id]") as HTMLElement;
  const action = btn.dataset.action;
  if (action === "view-activity") {
    deps.showActivity(card.dataset.id!);
    return;
  }
  if (action === "reveal-name") {
    await handleReveal(card, btn, deps.getVault);
    return;
  }

  btn.setAttribute("disabled", "true");
  if (action === "checkin") await handleCheckin(card.dataset.id!, btn, deps.reload);
  if (action === "delete") await handleDelete(card.dataset.id!, card.dataset.path!, btn, deps.reload);
}

async function handleCheckin(id: string, btn: HTMLElement, reload: () => Promise<void>): Promise<void> {
  try {
    await checkinVault(id);
    toast("Check-in tercatat", "success");
    await reload();
  } catch (err) {
    console.error("checkin error:", err);
    toast("Check-in gagal", "error");
    btn.removeAttribute("disabled");
  }
}

async function handleDelete(id: string, path: string, btn: HTMLElement, reload: () => Promise<void>): Promise<void> {
  if (!confirm("Hapus vault ini permanen?")) {
    btn.removeAttribute("disabled");
    return;
  }
  try {
    await deleteStorageFileBestEffort(path);
    await deleteVault(id);
    toast("Vault dihapus", "info");
    await reload();
  } catch (err) {
    console.error("delete error:", err);
    toast("Gagal menghapus", "error");
    btn.removeAttribute("disabled");
  }
}

async function handleReveal(
  card: HTMLElement,
  btn: HTMLElement,
  getVault: (id: string) => VaultRecord | undefined,
): Promise<void> {
  const vault = getVault(card.dataset.id!);
  if (!vault?.enc_filename || !vault.filename_iv) {
    toast("Data vault tidak lengkap", "error");
    return;
  }

  const nameSpan = card.querySelector(".vault-card__filename") as HTMLElement | null;
  if (!nameSpan || nameSpan.querySelector("input")) return;

  nameSpan.innerHTML = "";
  const input = document.createElement("input");
  input.type = "password";
  input.placeholder = "Frasa sandi";
  input.className = "form-input";
  input.style.cssText = "font-size:12px;padding:4px 8px;";
  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "btn btn--secondary btn--sm";
  ok.textContent = "OK";
  nameSpan.append(input, ok);
  input.focus();

  ok.addEventListener("click", () => void (async () => {
    const passphrase = input.value;
    if (!passphrase) return;
    ok.setAttribute("disabled", "true");
    try {
      const masterKey = await deriveMasterKey(
        passphrase,
        base64ToUint8(vault.salt),
        vault.kdf_iterations ?? LEGACY_KDF_ITERATIONS
      );
      const fileKey = await unwrapFileKey(
        base64ToArrayBuffer(vault.wrapped_file_key),
        masterKey,
        base64ToUint8(vault.wrap_iv)
      );
      const name = await decryptString(
        base64ToArrayBuffer(vault.enc_filename!),
        fileKey,
        base64ToUint8(vault.filename_iv!)
      );
      setRevealedName(vault.id, name);
      nameSpan.textContent = name;
      nameSpan.title = name;
      btn.remove();
    } catch {
      toast("Frasa salah - nama tidak bisa dibuka", "error");
      ok.removeAttribute("disabled");
    }
  })());

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") ok.click();
    if (e.key === "Escape") nameSpan.textContent = "Nama terenkripsi";
  });
}

async function deleteStorageFileBestEffort(path: string): Promise<void> {
  try {
    await deleteStorageFile(path);
  } catch (e) {
    console.warn("storage delete:", e);
  }
}
