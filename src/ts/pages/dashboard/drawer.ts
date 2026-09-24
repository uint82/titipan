import { getAuditLogs, EVENT_LABEL, EVENT_ICON_SVG, EVENT_COLOR } from "../../utils/audit";
import type { AuditLog } from "../../utils/audit";
import type { VaultRecord } from "../../utils/types";
import { esc, formatDateTime } from "../../utils/format";

export function openDrawer(vault: VaultRecord): void {
  const drawer = document.getElementById("activity-drawer")!;
  const filename = document.getElementById("drawer-filename")!;
  const body = document.getElementById("drawer-body")!;

  filename.textContent = vault.original_filename ?? "Tanpa nama";
  body.innerHTML = `<p class="drawer__loading">Memuat aktivitas…</p>`;
  drawer.classList.add("drawer--open");
  drawer.setAttribute("aria-hidden", "false");

  getAuditLogs(vault.id)
    .then(logs => {
      body.innerHTML = logs.length === 0
        ? `<p class="drawer__empty">Belum ada aktivitas</p>`
        : logs.map(renderTimelineEvent).join("");
    })
    .catch(() => {
      body.innerHTML = `<p class="drawer__empty">Gagal memuat aktivitas</p>`;
    });
}

export function closeDrawer(): void {
  const drawer = document.getElementById("activity-drawer")!;
  drawer.classList.remove("drawer--open");
  drawer.setAttribute("aria-hidden", "true");
}

export function bindDrawer(): void {
  document.getElementById("drawer-close")!.addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop")!.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
}

function renderTimelineEvent(log: AuditLog): string {
  const icon = EVENT_ICON_SVG[log.event_type] ?? "";
  const label = EVENT_LABEL[log.event_type] ?? log.event_type;
  const color = EVENT_COLOR[log.event_type] ?? "neutral";

  return `
    <div class="vault-timeline__event">
      <span class="vault-timeline__icon vault-timeline__icon--${color}">${icon}</span>
      <div class="vault-timeline__body">
        <span class="vault-timeline__label">${label}${eventExtra(log)}</span>
        <span class="vault-timeline__time">${formatDateTime(log.created_at)}</span>
      </div>
    </div>
  `;
}

function eventExtra(log: AuditLog): string {
  if (log.event_type === "email_sent" && log.metadata?.recipient) {
    return ` ke ${esc(String(log.metadata.recipient))}`;
  }
  if (log.event_type === "reminder_sent" && log.metadata?.type) {
    return ` (H-${esc(String(log.metadata.type))})`;
  }
  return "";
}
