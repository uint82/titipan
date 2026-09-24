import { getUser } from "../utils/auth";
import { authenticatePasskey } from "../utils/webauthn";
import { toast } from "./toast";
import { supabase } from "../utils/supabase";

async function init() {
  const user = await getUser();
  if (user) { window.location.href = "/dashboard.html"; return; }

  const stepEmail = document.getElementById("step-email")!;
  const stepPasskey = document.getElementById("step-passkey")!;
  const emailForm = document.getElementById("email-form") as HTMLFormElement;
  const emailInput = document.getElementById("email") as HTMLInputElement;
  const displayEmail = document.getElementById("display-email")!;
  const changeEmailBtn = document.getElementById("change-email")!;
  const passkeyBtn = document.getElementById("passkey-btn") as HTMLButtonElement;
  const passkeyBtnText = document.getElementById("passkey-btn-text")!;
  const otpBtn = document.getElementById("otp-btn") as HTMLButtonElement;
  const otpBtnText = document.getElementById("otp-btn-text")!;
  const toggleLoginBtn = document.getElementById("toggle-login")!;
  const toggleRegisterBtn = document.getElementById("toggle-register")!;
  const loginMode = document.getElementById("login-mode")!;
  const registerMode = document.getElementById("register-mode")!;

  let isRegisterMode = false;

  const divider = document.querySelector("#step-passkey .divider") as HTMLElement;

  function setMode(register: boolean) {
    isRegisterMode = register;
    loginMode.classList.toggle("hidden", register);
    registerMode.classList.toggle("hidden", !register);
    passkeyBtn.classList.toggle("hidden", register);
    divider?.classList.toggle("hidden", register);
    otpBtnText.textContent = register ? "Kirim tautan pendaftaran" : "Kirim tautan masuk ke email";
  }

  toggleRegisterBtn.addEventListener("click", () => setMode(true));

  toggleLoginBtn.addEventListener("click", () => setMode(false));

  emailForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) return;

    displayEmail.textContent = email;
    stepEmail.classList.add("hidden");
    stepPasskey.classList.remove("hidden");
  });

  changeEmailBtn.addEventListener("click", () => {
    stepPasskey.classList.add("hidden");
    stepEmail.classList.remove("hidden");
  });

  passkeyBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) return;

    passkeyBtn.disabled = true;
    passkeyBtnText.textContent = "Menunggu passkey…";

    try {
      await authenticatePasskey(email);
      toast("Berhasil masuk", "success");
      window.location.href = "/dashboard.html";
    } catch (err: any) {
      if (err?.message === "NO_PASSKEY") {
        toast("Belum ada passkey untuk email ini. Gunakan tautan email dulu, lalu daftarkan passkey di dashboard.", "warning");
      } else {
        toast("Autentikasi gagal. Coba lagi atau gunakan tautan email.", "error");
      }
      passkeyBtn.disabled = false;
      passkeyBtnText.textContent = "Masuk dengan passkey";
    }
  });

  otpBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) return;

    otpBtn.disabled = true;
    otpBtnText.textContent = "Mengirim tautan...";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: isRegisterMode },
    });

    if (error) {
      const isUserNotFound = error.message.toLowerCase().includes("not found") ||
        error.message.toLowerCase().includes("invalid login");
      if (isUserNotFound && !isRegisterMode) {
        toast("Akun tidak ditemukan. Klik \"Buat akun baru\" untuk mendaftar.", "warning");
      } else {
        toast(error.message, "error");
      }
      otpBtnText.textContent = isRegisterMode ? "Kirim tautan pendaftaran" : "Kirim tautan masuk ke email";
    } else {
      const successMsg = isRegisterMode
        ? "Link pendaftaran dikirim! Cek email kamu untuk mengaktifkan akun."
        : "Link masuk dikirim! Cek email kamu.";
      toast(successMsg, "success");
      otpBtnText.textContent = "Link terkirim! Cek email kamu";
    }
  });
}

init();
