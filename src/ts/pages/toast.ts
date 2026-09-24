type ToastType = "success" | "error" | "warning" | "info";

export function toast(message: string, type: ToastType = "info"): void {
  const container = document.getElementById("toast-container")!;
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  container.appendChild(el);

  requestAnimationFrame(() => el.classList.add("toast--visible"));

  setTimeout(() => {
    el.classList.remove("toast--visible");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }, 3500);
}
