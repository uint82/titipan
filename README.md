# Titipan

Titipan adalah aplikasi vault terenkripsi dengan pelepasan otomatis.
Pemilik mengunggah file yang dienkripsi di browser, menentukan penerima,
lalu melakukan check-in berkala. Jika batas waktu check-in terlewat,
vault otomatis dikirim ke penerima. Server tidak pernah melihat isi file,
frasa sandi, atau kunci enkripsi.

## Fitur

* Vault file terenkripsi (AES-GCM 256, kunci dibungkus dengan kunci turunan PBKDF2 dari frasa sandi).
* Check-in berkala dengan pilihan 7, 14, 30, 60, atau 90 hari.
* Pelepasan otomatis ke penerima saat deadline terlewat, lewat email.
* Pengingat H-7 dan H-1 ke pemilik sebelum deadline.
* Masuk tanpa kata sandi: passkey (standar WebAuthn) atau tautan email.
* Linimasa aktivitas per vault (diunggah, check-in, pengingat, terkirim, dibuka, diunduh).
* Kategori vault dengan filter di dashboard.

## Arsitektur

* Frontend: Vite multi-page app (TypeScript, SCSS), tiga halaman: masuk, dashboard, verifikasi penerima.
* Backend: Supabase (Auth, Postgres dengan Row Level Security, Storage privat, Edge Functions, cron pg_cron).
* Email: Brevo (rilis vault dan pengingat).
* Kriptografi: Web Crypto API di browser. Kunci file acak per vault, dibungkus kunci master dari frasa sandi (PBKDF2 250.000 iterasi, garam 32 byte).

## Prasyarat

* Node.js 20+ dan npm.
* Proyek Supabase dengan tabel `vaults`, `audit_logs`, `passkeys`, `webauthn_challenges`, bucket Storage `vaults`, dan kebijakan RLS yang sesuai.
* Akun Brevo untuk pengiriman email.
* Supabase CLI (untuk deploy Edge Functions).

## Menjalankan lokal

```bash
npm install
cp .env.example .env
```

Isi `.env` dengan nilai proyek Supabase kamu:

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_SUPABASE_FUNCTIONS_URL=https://xxx.supabase.co/functions/v1
```

Jalankan server pengembangan:

```bash
npm run dev
```

Build produksi:

```bash
npm run build
```

## Secrets Edge Functions

Atur di dashboard Supabase (Edge Functions - Secrets), jangan simpan di repo:

* `SUPABASE_URL`
* `SUPABASE_SERVICE_ROLE_KEY`
* `ANON_KEY`
* `WEBAUTHN_RP_ID` (contoh: `titipan.vercel.app`)
* `WEBAUTHN_RP_NAME` (contoh: `Titipan`)
* `WEBAUTHN_ORIGIN` (contoh: `https://titipan.vercel.app`)
* `APP_URL` (contoh: `https://titipan.vercel.app`)
* `BREVO_API_KEY`
* `BREVO_SENDER_EMAIL`
* `CRON_SECRET` (string acak panjang, dipakai cron internal)

Deploy fungsi:

```bash
supabase functions deploy auth-challenge --no-verify-jwt
supabase functions deploy auth-login --no-verify-jwt
supabase functions deploy auth-register --no-verify-jwt
supabase functions deploy verify-vault --no-verify-jwt
supabase functions deploy log-decrypt --no-verify-jwt
supabase functions deploy check-deadlines
supabase functions deploy send-reminders
```

## Cron

* `check-deadlines`: tiap 15 menit. Menandai vault kedaluwarsa sebagai terkirim dan mengirim email ke penerima. Gagal kirim akan diulang di jadwal berikut.
* `send-reminders`: tiap jam. Mengirim pengingat H-7 dan H-1 ke pemilik. Masing-masing dikirim sekali per vault.

Kedua cron memanggil Edge Functions dengan header `Authorization: Bearer <CRON_SECRET>`.

## Alur penggunaan

1. Daftar atau masuk dengan tautan email, lalu daftarkan passkey dari banner di dashboard.
2. Buat vault: unggah file, pilih kategori, isi email penerima, batas check-in, dan frasa sandi (minimal 12 karakter).
3. Bagikan frasa sandi ke penerima di luar aplikasi.
4. Lakukan check-in sebelum deadline. Jika terlewat, penerima mendapat email berisi tautan verifikasi.
5. Penerima membuka tautan, memasukkan frasa sandi, file terdekripsi dan terunduh di browsernya.

## Struktur repo

```text
index.html               Halaman masuk
dashboard.html           Dashboard vault
verify.html              Halaman dekripsi penerima
src/html/                Partial HTML (logo, ikon, head, navbar)
src/styles/              SCSS (variabel, base, halaman, linimasa, kategori)
src/ts/pages/            Logika halaman (login, dashboard, verify)
src/ts/pages/dashboard/  Modul dashboard (tampilan, aksi, drawer, modal)
src/ts/utils/            Klien Supabase, auth, kripto, storage, format, ikon
supabase/functions/      Edge Functions (satu folder satu fungsi)
public/favicon.svg       Ikon tab browser
```

## Catatan keamanan

* Frasa sandi tidak pernah dikirim ke server dan tidak disimpan di mana pun.
* Link verifikasi adalah token bearer. Perlakukan seperti kata sandi dan jangan dibagikan ke selain penerima.
* Tautan unduh bertanda tangan kedaluwarsa dalam 15 menit dan diterbitkan ulang setiap halaman dibuka.
