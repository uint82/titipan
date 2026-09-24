import {
  deriveMasterKey, unwrapFileKey, decryptFile,
  base64ToArrayBuffer, base64ToUint8,
} from "../utils/crypto";
import { toast } from "./toast";
import { checkIcon } from "../utils/icons";
import { esc } from "../utils/format";

const API_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

interface VerifyVaultData {
  id: string;
  original_filename: string;
  mime_type: string;
  released_at: string | null;
  wrapped_file_key?: string;
  wrap_iv?: string;
  file_iv?: string;
  salt?: string;
  signed_url?: string;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const vaultId = params.get("vault");

  const loadingEl = document.getElementById("vault-loading")!;
  const errorEl = document.getElementById("vault-error")!;
  const infoEl = document.getElementById("vault-info")!;
  const notReleasedEl = document.getElementById("not-released")!;
  const decryptEl = document.getElementById("decrypt-section")!;

  if (!vaultId) {
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/verify-vault`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vaultId })
    });

    if (res.status === 429) {
      loadingEl.classList.add("hidden");
      toast("Terlalu banyak permintaan. Tunggu sebentar lalu refresh.", "warning");
      errorEl.querySelector("p")!.textContent = "Terlalu banyak permintaan";
      errorEl.classList.remove("hidden");
      return;
    }

    if (!res.ok) {
      throw new Error("Vault not found or error loading vault");
    }

    const vault: VerifyVaultData = await res.json();
    loadingEl.classList.add("hidden");

    infoEl.innerHTML = `
      <div class="vault-info-row">
        <span>File</span>
        <span>${esc(vault.original_filename ?? "Tidak diketahui")}</span>
      </div>
      <div class="vault-info-row">
        <span>Tipe</span>
        <span>${esc(vault.mime_type ?? "-")}</span>
      </div>
      <div class="vault-info-row">
        <span>Status</span>
        <span>${vault.released_at ? "Terkirim" : "Belum dikirimkan"}</span>
      </div>
    `;
    infoEl.classList.remove("hidden");

    if (!vault.released_at) {
      notReleasedEl.classList.remove("hidden");
      return;
    }

    decryptEl.classList.remove("hidden");
    bindDecryptForm(vault);

  } catch {
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
  }
}

function bindDecryptForm(vault: VerifyVaultData) {
  const form = document.getElementById("verify-form") as HTMLFormElement;
  const decryptBtn = document.getElementById("decrypt-btn") as HTMLButtonElement;
  const resultEl = document.getElementById("decrypt-result")!;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const passphrase = (document.getElementById("passphrase") as HTMLInputElement).value;
    if (!passphrase) return;

    decryptBtn.disabled = true;
    decryptBtn.classList.add("btn--loading");
    decryptBtn.textContent = "";

    try {
      const salt = base64ToUint8(vault.salt!);
      const masterKey = await deriveMasterKey(passphrase, salt);
      const wrappedKey = base64ToArrayBuffer(vault.wrapped_file_key!);
      const wrapIv = base64ToUint8(vault.wrap_iv!);
      const fileKey = await unwrapFileKey(wrappedKey, masterKey, wrapIv);

      const downloadRes = await fetch(vault.signed_url!);
      if (!downloadRes.ok) throw new Error("Failed to download encrypted file");
      const ciphertext = await downloadRes.arrayBuffer();

      const fileIv = base64ToUint8(vault.file_iv!);
      const plaintext = await decryptFile(ciphertext, fileKey, fileIv);

      const blob = new Blob([plaintext], { type: vault.mime_type ?? "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: vault.original_filename ?? "file-terdekripsi",
      });
      a.click();
      URL.revokeObjectURL(url);

      await fetch(`${API_URL}/log-decrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: vault.id })
      });

      form.classList.add("hidden");
      resultEl.innerHTML = `
        <div class="verify-status">
          <div class="verify-status__icon verify-status__icon--success">
            ${checkIcon()}
          </div>
          <h3>File terdekripsi</h3>
          <p>${esc(vault.original_filename ?? "File")} telah diunduh ke perangkatmu.</p>
        </div>
      `;
      resultEl.classList.remove("hidden");

    } catch {
      toast("Dekripsi gagal - frasa sandi salah?", "error");
      decryptBtn.disabled = false;
      decryptBtn.classList.remove("btn--loading");
      decryptBtn.textContent = "Dekripsi & unduh";
    }
  });
}

init();
