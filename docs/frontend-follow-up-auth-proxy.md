# Follow-up frontend: autentikasi melalui API Next.js

Tanggal: 18 Oktober 2026. **Kontrak baru ini menggantikan instruksi lama yang
meminta Flutter menghubungi Neon Auth secara langsung.**

## 1. Status dan konfigurasi

Kode dan tes backend tersedia di repository. Deployment Vercel, konfigurasi
secret/domain provider, dan signup/login akun nyata belum dikonfirmasi oleh
pekerjaan ini. Jangan menganggap endpoint baru sudah live hanya karena ada dokumen.
Backend tidak membuat akun production atau mengirim email pengujian otomatis.

Mobile cukup memakai:

```text
API_BASE_URL=https://musmove-backend.vercel.app/api/v1
```

Hapus kebutuhan `NEON_AUTH_BASE_URL` dari konfigurasi mobile untuk alur ini.
URL upstream dan seluruh secret berada di backend. Alurnya:

```text
Flutter -> /api/v1/auth/* di Next.js -> Neon Auth
Flutter -> /api/v1/me, /sync/*, dll dengan JWT -> Next.js -> database aplikasi
```

Tidak ada sistem password baru: Neon tetap mengelola password, identitas, dan
session. Tabel aplikasi, ID user internal, sync, social, serta deletion tidak
diubah oleh proxy ini. Tidak diperlukan migrasi database khusus untuk auth proxy.

## 2. Dua jenis token, jangan tertukar

| Token | Diperoleh dari | Pemakaian |
| --- | --- | --- |
| `sessionToken` | Register/login, restore session, dan respons token baru | `Authorization: Session <sessionToken>` hanya untuk `/auth/get-session`, `/auth/token`, dan `/auth/sign-out`. |
| `accessToken` | `GET /auth/token` | `Authorization: Bearer <accessToken>` untuk `/me`, sync, meals, social, deletion, dan endpoint data privat lainnya. |

`sessionToken` adalah envelope session terenkripsi, **bukan JWT akses API data**
dan bukan `refresh_token` OAuth. Client memperlakukannya sebagai string opaque,
tidak perlu mendekripsi atau membaca isinya. Backend memvalidasi session langsung
ke provider ketika restore atau mengambil JWT; envelope saja tidak membuktikan
session masih aktif. JWT diverifikasi backend sebelum dikembalikan oleh proxy.

Simpan `sessionToken` pada secure storage OS, terpisah per akun/environment.
JWT sebaiknya di memori; jika dipersist, gunakan secure storage juga.
Jangan memakai SharedPreferences/log biasa untuk token atau password.
Perbarui redaction logger HTTP/crash reporter untuk `sessionToken`, `accessToken`,
`Authorization` (baik Session maupun Bearer), password, serta body/respons auth
yang sensitif. Jangan hanya menyensor key lama bernama `token`.

Flutter tidak perlu menyimpan atau meneruskan cookie Neon. Respons proxy tidak
mengirim `Set-Cookie`; cookie upstream yang diizinkan hanya disimpan di dalam
envelope terenkripsi. Session web/cookie otomatis bukan kontrak endpoint ini.

## 3. Daftar endpoint

Seluruh path berikut ditambahkan ke `API_BASE_URL`:

| Metode | Path | Body | Autentikasi |
| --- | --- | --- | --- |
| POST | `/auth/sign-up/email` | `name`, `email`, `password` | Tidak ada header Authorization. |
| POST | `/auth/sign-in/email` | `email`, `password` | Tidak ada header Authorization. |
| GET | `/auth/get-session` | Tidak ada | `Session <sessionToken>` |
| GET | `/auth/token` | Tidak ada | `Session <sessionToken>` |
| POST | `/auth/sign-out` | **Tidak ada body**, bukan `{}` | `Session <sessionToken>` |
| POST | `/auth/request-password-reset` | `email` | Tidak ada header Authorization. |

Untuk body JSON, kirim `Content-Type: application/json`. GET tidak mengirim body.
Semua endpoint ini menolak query parameter, termasuk token pada URL.
Field tambahan seperti `callbackURL`, `redirectTo`, `role`, `providerUrl`, atau
`rememberMe` ditolak. Jangan meneruskan body provider mentah ke endpoint MusMove.
Pisahkan interceptor auth: jangan otomatis memasang Bearer JWT pada register,
login, atau permintaan reset; gunakan skema Session hanya pada tiga endpoint
session, dan Bearer hanya pada API data. Jangan membuat fallback diam-diam ke
Neon langsung ketika proxy 401/503.
Callback dan Origin upstream ditentukan backend dari konfigurasi tepercaya,
bukan `Host` atau URL pilihan client. Native tidak perlu menambahkan header
Origin palsu/localhost untuk mengatasi error `MISSING_ORIGIN`.

Body maksimal 8 KiB. Nama 1–120 karakter setelah trim; email valid maksimal
254 karakter; password signup 8–128 karakter, login 1–128 karakter, tanpa trim
password. Kebijakan tambahan password tetap mengikuti provider.

### Register/login

```http
POST /api/v1/auth/sign-up/email
Content-Type: application/json
```

```json
{
  "name": "Nama pengguna",
  "email": "user@example.com",
  "password": "GANTI_DENGAN_INPUT_PENGGUNA"
}
```

Login memakai body yang sama **tanpa `name`**. Contoh respons HTTP 200 ketika
session tersedia, dengan token/tanggal ilustrasi:

```json
{
  "status": "authenticated",
  "user": {
    "id": "ID_USER_PROVIDER",
    "email": "user@example.com",
    "name": "Nama pengguna",
    "emailVerified": true
  },
  "sessionToken": "OPAQUE_ENCRYPTED_SESSION",
  "sessionExpiresAt": "2026-10-25T10:00:00.000Z"
}
```

`user.id` di sini adalah ID provider/JWT `sub`, bukan otomatis `user.id` internal
yang dikembalikan `/me`. Keduanya jangan dipertukarkan untuk kepemilikan data.

Jika provider tidak membuat session saat signup, HTTP 200 berisi `user`,
`sessionToken: null`, `sessionExpiresAt: null`, dengan salah satu status:

- `verification_required`: provider mensyaratkan/menandai kebutuhan verifikasi; jangan masuk ke halaman akun atau memanggil endpoint privat. Ini **bukan bukti email berhasil terkirim**.
- `sign_in_required`: signup tidak menghasilkan session meskipun email sudah terverifikasi; arahkan ke login.

Proxy tidak mengaktifkan/menonaktifkan kebijakan email verification dan tidak
mengimplementasikan alur verifikasi email native baru. Jika provider masih
mewajibkannya, konfigurasi/alur tersebut tetap harus dipenuhi.

### Restore dan mengambil JWT

```http
GET /api/v1/auth/get-session
Authorization: Session OPAQUE_ENCRYPTED_SESSION
```

Respons sukses memiliki bentuk `authenticated` seperti di atas. Session envelope
baru diterbitkan setiap respons sukses: **ganti nilai di secure storage secara
atomik sebelum request session berikutnya**, termasuk setelah `/auth/token`.
Gunakan single-flight untuk restore/pengambilan token agar rotasi session tidak
berlomba. Jangan menimpa session baru dengan respons request lama.

```http
GET /api/v1/auth/token
Authorization: Session OPAQUE_ENCRYPTED_SESSION
```

Responsnya memiliki field yang sama dengan `authenticated`, ditambah:

```json
{
  "accessToken": "JWT_AKSES_DARI_PROVIDER",
  "tokenType": "Bearer"
}
```

Cuplikan terakhir bukan respons lengkap. Simpan juga `sessionToken` dan
`sessionExpiresAt` terbaru dari respons penuh. `sessionExpiresAt` adalah batas
envelope, maksimum 30 hari atau expiry provider jika lebih singkat; **bukan expiry
JWT**. JWT tetap berumur pendek sesuai validasi API, sekitar 15 menit.

Setelah itu panggil `/me` dengan Bearer JWT, lalu lanjutkan onboarding/sync.
Mapping user aplikasi dibuat pada request API privat pertama seperti sebelumnya.

### Logout

```http
POST /api/v1/auth/sign-out
Authorization: Session OPAQUE_ENCRYPTED_SESSION
```

Jangan kirim body atau query. Sukses HTTP 200: `{"status":"signed_out"}`.
Backend meminta pencabutan session provider. Hentikan sync, hapus token lokal,
dan tutup akses database privat akun. Jika offline/503, logout lokal boleh tetap
dilakukan tetapi jangan mengklaim session server sudah dicabut. HTTP 401 pada
session yang sudah tidak berlaku berarti client perlu login kembali.
JWT yang sudah terbit tidak otomatis batal saat logout; tetap bisa berlaku
sampai expiry. Pemeriksaan status akun pada API data tetap berjalan.

### Reset password

POST `/auth/request-password-reset` dengan `{"email":"user@example.com"}`.
Respons HTTP 200 berstatus `accepted` dengan pesan generik, **bukan konfirmasi
email terdaftar atau berhasil terkirim**. Client tidak mengirim `redirectTo`.
Backend menetapkan callback web:
`https://musmove-backend.vercel.app/auth/reset-password`.
Setelah menyelesaikan reset di web, pengguna kembali ke aplikasi dan login.
Jangan memakai halaman `/auth/mobile` sebagai endpoint pertukaran token.

## 4. Error dan retry

Format error tetap `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`.

| HTTP / kode | Tindakan frontend |
| --- | --- |
| 400 `VALIDATION_ERROR` / 413 / 415 | Perbaiki field, query, ukuran, atau Content-Type. Jangan retry otomatis. |
| 400 `AUTH_SIGN_UP_REJECTED` | Tampilkan kegagalan generik; tawarkan login/reset, jangan mengasumsikan akun berhasil dibuat. |
| 401 `AUTH_INVALID_CREDENTIALS` | Minta pengguna memeriksa kredensial. |
| 401 `AUTH_SESSION_INVALID` | Hentikan loop refresh dan arahkan login; jangan menghapus data offline/outbox. |
| 403 `AUTH_EMAIL_VERIFICATION_REQUIRED` | Ikuti kebijakan verifikasi provider, bukan retry login terus-menerus. |
| 403 `ORIGIN_NOT_ALLOWED` | Periksa konfigurasi web/client; native tidak menambahkan Origin palsu. |
| 429 `RATE_LIMITED` / `AUTH_RATE_LIMITED` | Ikuti header `Retry-After`, tanpa polling rapat. |
| 503 `AUTH_CONFIGURATION_REQUIRED` | Eskalasi ke backend: secret atau konfigurasi domain/callback belum benar. |
| 503 `AUTH_UNAVAILABLE` / timeout | Hasil mutasi mungkin belum diketahui. Signup: coba login sebelum mendaftar ulang; reset: jangan spam email; logout: jangan klaim pencabutan berhasil. |

Saat API data mengembalikan 401, lakukan satu pengambilan JWT baru lewat
`/auth/token`, lalu retry request data maksimal sekali. Untuk sync push, gunakan
body dan `operationId` yang sama. HTTP 403 `ACCOUNT_INACTIVE` bukan alasan refresh
terus-menerus. Semua request akun lama harus dibatalkan/diabaikan saat ganti akun.

## 5. Checklist backend sebelum frontend memakai production

- [ ] `AUTH_SECRET` pada Vercel adalah random kuat minimal 32 karakter, berbeda dari `SYNC_CURSOR_SECRET` dan `API_RATE_LIMIT_SECRET`. Tidak boleh ada dalam APK/IPA/repository.
- [ ] `NEON_AUTH_BASE_URL` adalah URL HTTPS provider yang benar, hanya untuk server.
- [ ] `AUTH_PUBLIC_ORIGIN` adalah origin HTTPS deployment yang benar; default `https://musmove-backend.vercel.app`. Jangan menyalin domain production ke environment lain tanpa meninjau callback.
- [ ] Origin tersebut ditambahkan pada trusted domains Neon untuk branch yang sama. Callback signup/login ditetapkan backend ke `/auth/mobile`, dan reset ke `/auth/reset-password`; tidak ada open redirect pilihan client.
- [ ] `npm run security:check` lolos. `AUTH_SECRET` yang tidak valid membuat auth gagal tertutup; pengecekan auth tidak mematikan API data JWT yang sebelumnya berjalan.
- [ ] Deploy kode, cek `/meta` memiliki capability `nativeAuthProxy: true`, lalu lakukan smoke test route. Capability bukan bukti secret/domain/email sudah benar.
- [ ] Dengan akun uji yang disetujui, uji signup/login, restore setelah restart aplikasi, expiry JWT, `/me`, logout, dan penolakan session sesudah logout.
- [ ] Uji reset email nyata hanya setelah konfigurasi pengiriman dan allowlist benar. Email verification, OAuth, dan scan foto tetap bukan penambahan fitur pada pekerjaan ini.

Tidak ada migration production, pengubahan allowlist, deployment, atau
pengiriman email nyata yang dijalankan otomatis oleh implementasi ini.
Migrasi `0019` penghapusan field katalog tetap memiliki urutan rollout tersendiri;
jangan menjalankannya hanya karena sedang mengaktifkan auth proxy.

## 6. Keamanan dan batasan

Proxy hanya menyediakan enam endpoint di atas. Tidak ada catch-all menuju
`/admin`, penghapusan user provider, OAuth, atau endpoint arbitrer Neon. Cookie
admin/user dari request, header Authorization masuk, dan header forwarding client
tidak disalin ke provider. Cookie session provider yang diizinkan dibungkus
terenkripsi dan token tidak boleh masuk query, log, cache bersama, atau analytics.

Payload dan respons provider dibatasi; timeout 10 detik per panggilan provider,
redirect tidak diikuti, error provider diganti error aman. Batas aplikasi:
login 10/10 menit/IP, signup 10/10 menit/IP, reset 5/10 menit/IP, dan masing-masing
endpoint session/token/logout 60/menit/IP, ditambah batas IP umum dan provider.
NAT dapat membuat banyak perangkat berbagi bucket.

Rotasi `AUTH_SECRET` atau perubahan origin/upstream membuat envelope lama tidak
berlaku dan pengguna perlu login lagi. Ini tidak otomatis mencabut seluruh session
di provider. Endpoint Neon tetap publik: aturan yang hanya ada di proxy bukan
jaminan orang tidak dapat menghubungi provider langsung. Proteksi provider harus
tetap dikonfigurasi. Alur browser/OAuth memerlukan desain tersendiri.

Rujukan: [panduan mobile](mobile-integration.md), [OpenAPI](openapi.yaml),
[follow-up social/deletion/sync](backend-follow-up-result.md), dan
[follow-up katalog makanan](frontend-follow-up-meal-catalog.md).
