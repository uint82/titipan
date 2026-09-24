import type { VaultRecord, VaultCategory } from "../../utils/types";
import { CATEGORY_LABEL, CATEGORY_ICON, CATEGORY_COLOR } from "../../utils/types";
import { fileIcon, mailIcon, clockIcon, chevronRightIcon } from "../../utils/icons";
import { esc } from "../../utils/format";

export type VaultFilter = VaultCategory | "all";

export function renderFilterBar(
  vaults: VaultRecord[],
  activeFilter: VaultFilter,
  onSelect: (filter: VaultFilter) => void,
): void {
  const bar = document.getElementById("category-filter");
  if (!bar) return;

  const counts: Partial<Record<VaultFilter, number>> = { all: vaults.length };
  for (const v of vaults) {
    counts[v.category] = (counts[v.category] ?? 0) + 1;
  }

  const activeCategories = (Object.keys(CATEGORY_LABEL) as VaultCategory[])
    .filter(c => (counts[c] ?? 0) > 0);

  bar.innerHTML = [
    `<button class="filter-pill ${activeFilter === "all" ? "filter-pill--active" : ""}"
       data-filter="all">
       Semua
       <span class="filter-pill__count">${counts.all}</span>
     </button>`,
    ...activeCategories.map(cat => `
      <button class="filter-pill ${activeFilter === cat ? "filter-pill--active" : ""}"
        data-filter="${cat}">
        <span class="filter-pill__icon filter-pill__icon--${CATEGORY_COLOR[cat]}">
          ${CATEGORY_ICON[cat]}
        </span>
        ${CATEGORY_LABEL[cat]}
        <span class="filter-pill__count">${counts[cat]}</span>
      </button>
    `),
  ].join("");

  bar.querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      onSelect((btn as HTMLElement).dataset.filter as VaultFilter);
    });
  });
}

export function renderGrid(
  vaults: VaultRecord[],
  activeFilter: VaultFilter,
  onEmptyNew: () => void,
): void {
  const grid = document.getElementById("vault-grid")!;
  const empty = document.getElementById("vault-empty")!;

  const filtered = activeFilter === "all"
    ? vaults
    : vaults.filter(v => v.category === activeFilter);

  if (filtered.length === 0) {
    grid.classList.add("hidden");
    empty.classList.remove("hidden");
    const emptyBtn = document.getElementById("new-vault-empty-btn");
    if (emptyBtn) emptyBtn.onclick = onEmptyNew;
    return;
  }

  empty.classList.add("hidden");
  animateGridFlip(grid, () => {
    grid.innerHTML = filtered.map(renderVaultCard).join("");
    grid.classList.remove("hidden");
  });
}

function animateGridFlip(grid: HTMLElement, render: () => void): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    render();
    return;
  }

  const oldPos = readCardPositions(grid);
  render();
  playFlip(grid, oldPos);
}

function readCardPositions(grid: HTMLElement): Map<string, DOMRect> {
  const positions = new Map<string, DOMRect>();
  if (grid.classList.contains("hidden")) return positions;
  grid.querySelectorAll("[data-id]").forEach((el) => {
    positions.set((el as HTMLElement).dataset.id!, el.getBoundingClientRect());
  });
  return positions;
}

function playFlip(grid: HTMLElement, oldPos: Map<string, DOMRect>): void {
  grid.querySelectorAll("[data-id]").forEach((el) => {
    const card = el as HTMLElement;
    const prev = oldPos.get(card.dataset.id!);
    if (prev) slideCard(card, prev);
    else fadeCardIn(card);
  });
}

function slideCard(card: HTMLElement, from: DOMRect): void {
  const now = card.getBoundingClientRect();
  const dx = from.left - now.left;
  const dy = from.top - now.top;
  if (dx === 0 && dy === 0) return;
  card.animate(
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
    { duration: 350, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  );
}

function fadeCardIn(card: HTMLElement): void {
  card.animate(
    [{ opacity: "0", transform: "scale(0.96)" }, { opacity: "1", transform: "scale(1)" }],
    { duration: 250, easing: "ease-out" },
  );
}

export function renderVaultCard(v: VaultRecord): string {
  const status = vaultStatus(v);
  const countdown = deadlineLabel(v);
  const countdownClass = countdownColor(v);
  const catColor = CATEGORY_COLOR[v.category];
  const catLabel = CATEGORY_LABEL[v.category];
  const catIcon = CATEGORY_ICON[v.category];

  return `
    <article class="card vault-card" data-id="${v.id}" data-path="${esc(v.storage_object_key)}">
      <div class="vault-card__top">
        <div class="vault-card__file">
          ${fileIcon(16)}
          <span class="vault-card__filename" title="${esc(v.original_filename ?? '')}">${esc(v.original_filename ?? 'Tanpa nama')}</span>
        </div>
        <span class="badge badge--${statusBadge(status)}">${statusLabel(status)}</span>
      </div>

      <div class="vault-card__meta">
        <div class="vault-card__meta-row">
          ${mailIcon()}
          <span>${esc(v.recipient_email ?? '-')}</span>
        </div>
        <div class="vault-card__meta-row">
          ${clockIcon()}
          <span class="vault-card__countdown vault-card__countdown--${countdownClass}">
            ${countdown}
          </span>
        </div>
      </div>

      <div class="vault-card__category">
        <span class="category-badge category-badge--${catColor}">
          ${catIcon}
          ${catLabel}
        </span>
      </div>

      <div class="vault-card__actions">
        ${checkinButton(status)}
        <button class="btn btn--danger btn--sm" data-action="delete">Hapus</button>
        <button class="btn btn--ghost btn--sm vault-card__activity" data-action="view-activity">
          Aktivitas
          ${chevronRightIcon()}
        </button>
      </div>
    </article>
  `;
}

function checkinButton(status: string): string {
  if (status !== "active") return "";
  return `<button class="btn btn--secondary btn--sm" data-action="checkin">Check-in</button>`;
}

function vaultStatus(v: VaultRecord): "active" | "released" | "overdue" {
  if (v.released_at) return "released";
  if (v.deadline_at && new Date(v.deadline_at) < new Date()) return "overdue";
  return "active";
}

function statusLabel(s: string): string {
  if (s === "active") return "Aktif";
  if (s === "released") return "Terkirim";
  return "Terlambat";
}

function statusBadge(s: string): string {
  if (s === "active") return "success";
  if (s === "released") return "neutral";
  return "danger";
}

function deadlineLabel(v: VaultRecord): string {
  if (v.released_at) return "Terkirim";
  if (!v.deadline_at) return "-";
  const diff = new Date(v.deadline_at).getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  if (days < 0) return "Terlambat";
  if (days === 0) return "Jatuh tempo hari ini";
  return `${days} hari tersisa`;
}

function countdownColor(v: VaultRecord): string {
  if (v.released_at) return "ok";
  if (!v.deadline_at) return "ok";
  const days = Math.ceil((new Date(v.deadline_at).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "overdue";
  if (days <= 3) return "urgent";
  return "ok";
}
