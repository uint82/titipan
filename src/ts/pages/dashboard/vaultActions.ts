import { checkinVault, deleteVault } from "../../utils/vaults";
import { deleteStorageFile } from "../../utils/storage";
import { toast } from "../toast";

type ActionDeps = {
  reload: () => Promise<void>;
  showActivity: (id: string) => void;
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

async function deleteStorageFileBestEffort(path: string): Promise<void> {
  try {
    await deleteStorageFile(path);
  } catch (e) {
    console.warn("storage delete:", e);
  }
}
