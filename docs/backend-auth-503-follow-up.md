# Tindak lanjut backend: signup HTTP 503 AUTH_UNAVAILABLE

Tanggal: 19 Oktober 2026 (Asia/Jakarta).

Acuan: laporan frontend `backend-auth-503-report.md`, dengan request ID terbaru
`88975344-8672-4beb-b695-b0cc738eef40`. **Perbaikan source tersedia; deployment
dan keberhasilan signup akun nyata belum dikonfirmasi.**

## 1. Temuan yang berhasil dibuktikan

Ada ketidakcocokan nama cookie session pada proxy yang dibuat sebelumnya:

| Sumber/nama | Perilaku source sebelum perbaikan |
| --- | --- |
| `__Secure-neonauth.session_token` | Dikenali; dipakai fixture tes lama. |
| `neonauth.session_token` | Dikenali sebagai nama legacy. |
| `__Secure-neon-auth.session_token` | Tidak dikenali; padahal ini nama canonical pada SDK Neon saat diperiksa. |

Nama canonical diverifikasi pada paket publik `@neondatabase/auth@0.6.0-beta`
dan [konstanta sumber resmi Neon](https://github.com/neondatabase/neon-js/blob/main/packages/auth/src/server/constants.ts).
Dokumentasi alur Neon yang sebelumnya dijadikan acuan masih mencontohkan ejaan
`neonauth`; fixture awal mengikuti nama tersebut dan tidak mencakup ejaan SDK.

Reproduksi terisolasi memakai **source sebelum perbaikan**, data sintetis, dan
mock provider (tanpa database/auth production, pembuatan akun, atau email):

| Cookie pada respons signup sintetis yang sama | HTTP/result proxy | Panggilan provider sintetis |
| --- | --- | ---: |
| Nama legacy `__Secure-neonauth.session_token` | 200 `authenticated` | 2: signup, lalu get-session |
| Nama canonical `__Secure-neon-auth.session_token` | 503 `AUTH_UNAVAILABLE` | 1: signup saja |

Proxy lama melihat token pada JSON tetapi tidak menemukan cookie yang diizinkan,
lalu mengembalikan 503 sebelum memeriksa session. Ini menjelaskan bagaimana akun
dapat sudah dibuat oleh provider meskipun frontend menerima kegagalan.

**Batas kesimpulan:** ini bug source yang pasti dan menghasilkan error yang sama,
bukan bukti bahwa request production di atas pasti gagal karena cookie tersebut.
Respons/headers upstream dan log deployment untuk request asli belum tersedia.
Durasi 5428 ms tidak membuktikan timeout 10 detik ataupun tahap mana yang gagal.

Pemeriksaan provider nyata hanya berupa GET `/get-session` tanpa kredensial:
HTTP 200 dengan JSON null, tanpa Set-Cookie. Ini membuktikan endpoint dapat
diakses saat pemeriksaan, tetapi tidak memverifikasi signup/login, trusted domain,
atau nama cookie yang dikembalikan untuk akun nyata.

## 2. Perubahan backend

- Tambahkan nama canonical pada satu allowlist yang dipakai parser cookie dan schema envelope terenkripsi.
- Pertahankan dua nama legacy untuk kompatibilitas envelope lama; nama cookie tidak ditukar/diterjemahkan sebelum diteruskan ke provider.
- Tidak menerima wildcard/prefix umum: cache session, cookie admin, dan nama yang hanya menyerupai cookie session tetap ditolak/diabaikan.
- Jika provider mengirim beberapa nama cookie session yang diizinkan sekaligus, proxy tetap gagal tertutup karena ambigu.
- Validasi nilai cookie, subject session/JWT, encryption, expiry, dan pemisahan header Session vs Bearer tidak dilonggarkan.
- Tambah capability `nativeAuthCanonicalCookie: true` pada `/api/v1/meta` agar deployment perbaikan bisa dibedakan dari source lama. Capability bukan bukti auth nyata sudah berfungsi.
- Tambah tes fixture canonical dan kedua nama legacy, termasuk signup, restore, rotasi cookie, pengambilan JWT, dan logout.

Frontend **tidak perlu** mengganti request atau mengelola cookie Neon. Kontrak
di [follow-up auth proxy](frontend-follow-up-auth-proxy.md) tetap berlaku.

## 3. Diagnostik aman untuk kegagalan berikutnya

Kegagalan internal `AUTH_UNAVAILABLE` kini mencatat satu warning terstruktur:

```json
{
  "event": "auth_proxy_failure",
  "requestId": "ID_REQUEST_SERVER",
  "action": "sign-up/email",
  "stage": "sign-up/email",
  "reason": "session_cookie_missing"
}
```

Contoh di atas ilustrasi, bukan log baru dari production. Bila diketahui,
`upstreamStatus` berupa angka juga dicatat. Pesan publik tetap generik dan tidak
menyertakan reason internal, cookie, atau bentuk respons provider.

Kategori membedakan antara lain `session_cookie_missing`,
`session_cookie_ambiguous`, `session_cookie_invalid`, `auth_user_invalid`,
`session_shape_invalid`, `upstream_timeout`, `upstream_content_type`,
`upstream_http`, `upstream_transport`, `upstream_json`, dan `jwt_invalid`.
`stage: get-session` menunjukkan pemeriksaan session setelah signup/login,
bukan otomatis kegagalan pembuatan akun.

Tidak ada logging body request/respons, email/nama, password, header Cookie,
Set-Cookie, Authorization, token, URL privat, error mentah, atau nilai secret.
Tes memeriksa whitelist key diagnostik, korelasi request ID, dan tidak bocornya
fixture kredensial. Error 401/429 biasa tidak otomatis dicetak sebagai kegagalan
provider 503. Log lama tidak bisa diperkaya secara retroaktif dengan perubahan ini.

## 4. Checklist deployment dan uji layanan hidup

Verifikasi lokal selesai: tes auth (14), follow-up/sync/social/deletion (12),
dan keamanan (10) lolos. Lint, typecheck, production build Node 24, secret scan,
serta security preflight lokal juga lolos. Sesudah perbaikan, fixture cookie
canonical dan legacy menghasilkan alur authenticated yang lolos tes, tanpa
melonggarkan penolakan cookie asing/ambigu.

Pengecekan read-only domain production pada 19 Oktober: `/api/v1/meta` HTTP 200
dengan `nativeAuthProxy: true`, tetapi belum memiliki flag
`nativeAuthCanonicalCookie: true`. Jadi deployment yang diperiksa belum
mengonfirmasi memuat patch ini. Identitas deployment/commit aktif belum tersedia.

- [ ] Deploy source terbaru ke domain production. Agent tidak push/redeploy atau mengubah dashboard provider.
- [ ] GET `/api/v1/meta` menampilkan `nativeAuthProxy: true` dan `nativeAuthCanonicalCookie: true`. Catat deployment/commit yang benar-benar melayani domain tersebut.
- [ ] Pertahankan konfigurasi origin/trusted domain yang valid dari penanganan sebelumnya. Tidak ada bukti perlunya rotasi secret untuk bug cookie ini.
- [ ] Periksa akun dari percobaan sebelumnya dengan akses yang berwenang; jangan membuat signup berulang untuk menebak hasil mutasi.
- [ ] Jika akun sudah ada, gunakan login satu kali melalui proxy dengan akun uji yang disetujui. Jika belum, lakukan satu signup terkontrol.
- [ ] Bila authenticated, uji restore, `/auth/token`, `/me`, dan logout. Status verification_required/sign_in_required tetap bukan session aktif.
- [ ] Jika masih 503, cari warning `auth_proxy_failure` memakai request ID baru dan laporkan hanya action/stage/reason/upstreamStatus yang aman.
- [ ] Catat hasil reset/email secara terpisah; belum diuji dengan email nyata oleh pekerjaan ini.

Tidak ada migrasi database, rotasi secret, perubahan trusted domains, purge akun,
atau pengiriman email nyata pada perbaikan ini. Pengecekan keamanan lokal dan
tes sintetis tidak membuktikan konfigurasi Vercel/provider production sama.

## 5. Dokumen untuk frontend

Kirim dokumen ini sebagai tindak lanjut laporan 503. Untuk integrasi tetap gunakan
[panduan auth proxy](frontend-follow-up-auth-proxy.md),
[panduan mobile](mobile-integration.md), dan [OpenAPI](openapi.yaml).
Tidak ada perubahan bentuk payload sukses/error yang harus dimigrasikan di Flutter.
