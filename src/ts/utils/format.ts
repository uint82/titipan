// Shared text helpers for rendering user data into HTML.

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function bucketSizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return "<1MB";
  if (mb < 10) return "1-10MB";
  return "10-50MB";
}
