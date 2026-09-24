import { getUser, signOut } from "../utils/auth";
import { getVaultsByUser } from "../utils/vaults";
import { toast } from "./toast";
import { registerPasskey } from "../utils/webauthn";
import { renderFilterBar, renderGrid } from "./dashboard/vaultView";
import type { VaultFilter } from "./dashboard/vaultView";
import { bindVaultActions } from "./dashboard/vaultActions";
import { openDrawer, bindDrawer } from "./dashboard/drawer";
import { openModal, bindVaultModal } from "./dashboard/vaultModal";
import type { VaultRecord } from "../utils/types";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let currentUserId = "";
let currentVaults: VaultRecord[] = [];
let activeFilter: VaultFilter = "all";

async function init() {
  const user = await getUser();
  if (!user) { window.location.href = "/"; return; }

  currentUserId = user.id;
  document.getElementById("user-email")!.textContent = user.email;

  document.getElementById("signout-btn")!.addEventListener("click", async () => {
    await signOut();
    window.location.href = "/";
  });

  bindVaultActions({ reload: loadVaults, showActivity });
  bindVaultModal({ getUserId: () => currentUserId, reload: loadVaults });
  bindDrawer();
  await loadVaults();
  checkPasskeyStatus(user.email);
}

async function loadVaults() {
  const loading = document.getElementById("vault-loading")!;
  const grid = document.getElementById("vault-grid")!;
  const empty = document.getElementById("vault-empty")!;

  loading.classList.remove("hidden");
  grid.classList.add("hidden");
  empty.classList.add("hidden");

  try {
    currentVaults = await getVaultsByUser(currentUserId);
    loading.classList.add("hidden");
    renderFilterBar(currentVaults, activeFilter, selectFilter);
    renderGrid(currentVaults, activeFilter, openModal);
  } catch (err) {
    console.error("loadVaults error:", err);
    loading.classList.add("hidden");
    toast("Gagal memuat vault", "error");
  }
}

function selectFilter(filter: VaultFilter) {
  activeFilter = filter;
  renderFilterBar(currentVaults, activeFilter, selectFilter);
  renderGrid(currentVaults, activeFilter, openModal);
}

function showActivity(id: string) {
  const vault = currentVaults.find(v => v.id === id);
  if (vault) openDrawer(vault);
}

async function checkPasskeyStatus(email: string) {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/auth-challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ email, type: "authentication" }),
    });

    if (!res.ok) return;
    const { credentialIds } = await res.json();
    if (Array.isArray(credentialIds) && credentialIds.length === 0) {
      showPasskeyBanner(email);
    }
  } catch (e) {
    console.error(e);
  }
}

function showPasskeyBanner(email: string) {
  const banner = document.getElementById("passkey-banner")!;
  banner.classList.remove("hidden");
  banner.style.display = "flex";

  const btn = document.getElementById("register-passkey-btn") as HTMLButtonElement;
  btn.addEventListener("click", () => {
    void registerBannerPasskey(email, btn, banner);
  });
}

async function registerBannerPasskey(email: string, btn: HTMLButtonElement, banner: HTMLElement) {
  btn.disabled = true;
  btn.textContent = "Memproses...";
  try {
    await registerPasskey(email);
    toast("Passkey berhasil didaftarkan!", "success");
    banner.style.display = "none";
  } catch (err: unknown) {
    toast(err instanceof Error ? err.message : "Gagal mendaftarkan passkey", "error");
    btn.disabled = false;
    btn.textContent = "Daftarkan Passkey";
  }
}

init();
