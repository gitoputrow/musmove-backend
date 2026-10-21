# Panduan database, API, dan autentikasi mobile MusMove

Panduan implementasi untuk Android/iOS, termasuk Flutter. Disusun berdasarkan
schema, validator, dan handler di repository ini pada 18 Oktober 2026.
Kontrak field lengkap tersedia di [OpenAPI](openapi.yaml).

**Alur mobile terbaru (20 Oktober 2026):** gunakan
[handoff API langsung per fitur](frontend-follow-up-online-api.md) untuk mode
online, PATCH profil/preferensi gabungan, CRUD resource, hasil workout selesai,
favorit, jurnal dan ringkasan. Bagian sync/offline di panduan ini tetap merupakan
kontrak legacy; bukan kewajiban startup client online baru. Tidak ada penghapusan
storage/outbox lama atau deploy otomatis.

Pembaruan source v1.1: snapshot berhalaman, lifecycle penghapusan 7 hari,
social teks eksplisit, dan halaman penyelesaian reset password. Perubahan baru
memerlukan migration0016, grants, dan redeploy; jangan menganggap deployment
yang sebelumnya diperiksa sudah memuat source ini. Kontrak lengkap beserta
request/response, error dan rollout ada di
[hasil follow-up backend](backend-follow-up-result.md).

Pembaruan auth terbaru: Flutter memakai endpoint `/api/v1/auth/*` pada Next.js,
bukan Neon langsung. Kontrak token/session dan checklist migrasi frontend ada di
[follow-up auth proxy](frontend-follow-up-auth-proxy.md); instruksi ini menggantikan alur direct-provider lama.

Daftar isi:

- [Alamat layanan dan status integrasi](#1-ringkasan-dan-alamat-layanan)
- [Database dan kepemilikan data](#2-database-dan-kepemilikan-data)
- [Autentikasi mobile](#3-alur-autentikasi-mobile)
- [Request dan daftar endpoint](#4-aturan-request-api)
- [Offline dan sinkronisasi](#5-penyimpanan-offline-dan-sinkronisasi)
- [Alur setiap fitur](#6-alur-fitur-setelah-login)
- [Contoh Dart](#7-contoh-pemanggilan-dari-dart-native)
- [Error dan retry](#8-error-batas-dan-kebijakan-retry)
- [Checklist implementasi](#9-urutan-implementasi-dan-checklist-pengujian)
- [Referensi source](#10-referensi-implementasi-di-repository)

## 1. Ringkasan dan alamat layanan

```text
Mobile ── /auth/* + Session ──> Next.js API ──> Neon Auth
Mobile ── API data + Bearer JWT ──> Next.js API ──> Neon PostgreSQL
```

Mobile tidak terhubung langsung ke PostgreSQL atau Neon Data API. Seluruh
data aplikasi dibaca/diubah lewat backend Next.js; Neon Auth hanya menangani
identitas dan session. Backend memverifikasi JWT sebelum memilih data akun.

| Konfigurasi mobile | Nilai/keterangan |
| --- | --- |
| `API_BASE_URL` | `https://musmove-backend.vercel.app/api/v1` |
| `deviceId` | ID acak yang dibuat sekali per instalasi, bukan ID akun atau nomor perangkat keras |

`NEON_AUTH_BASE_URL` sekarang hanya konfigurasi backend, tidak diperlukan oleh
mobile. Untuk auth tambahkan `/auth/...` pada `API_BASE_URL`; jangan mengganti
alamat API dengan URL provider.

Jangan menggunakan URL dashboard Vercel atau URL deployment ber-ID sebagai
base URL mobile. Gunakan domain production HTTPS yang stabil di atas.

**Dilarang disertakan dalam APK/IPA:** `DATABASE_URL`, `DATABASE_URL_DIRECT`,
`AUTH_SECRET`, `SYNC_CURSOR_SECRET`, `API_RATE_LIMIT_SECRET`,
`EQUIPMENT_VISION_TOKEN`, API key admin Neon, dan token bypass Vercel.
JWT milik pengguna diperoleh setelah login, bukan ditanam dalam aplikasi.

### Status verifikasi

- Domain production telah diperiksa tanpa token: lima katalog mengembalikan
  HTTP 200; `/me` dan `/nutrition/targets` mengembalikan HTTP 401.
- Katalog yang terlihat saat pemeriksaan: 117 exercise, 12 program, 28 alat,
  18 places, dan 1.145 makanan referensi. Jumlah dapat berubah; jangan hardcode.
- Login pengguna asli, refresh session Flutter, dan operasi tulis production
  belum diuji end-to-end. Contoh di sini bukan klaim integrasi mobile sudah jadi.
- Repository menyediakan endpoint proxy `/api/v1/auth/*` dan kontrak native,
  bukan SDK Flutter siap pakai. Endpoint singkat `/api/v1/login`, `/register`,
  `/refresh`, atau `/logout` tetap tidak ada. Deployment proxy dan auth nyata
  harus dikonfirmasi; tes lokal sintetis bukan bukti provider production siap.

## 2. Database dan kepemilikan data

Schema source terbaru menyimpan 30 tabel aplikasi di schema `public` setelah
migration0016. Tabel internal
migration di schema `drizzle` dan tabel Auth yang dikelola provider di
`neon_auth` tidak termasuk hitungan 30 ini.

### 2.1 Katalog global: dibaca bersama, tidak ditulis mobile

| Tabel | Fungsi |
| --- | --- |
| `exercise_catalog` | Exercise gym/calisthenics; key gabungan `(mode, id)`, label, default sets/reps, requirements, movement tags |
| `equipment_catalog` | ID alat kanonis, nama, dan alias pencarian |
| `workout_program_catalog` | Template program, mode, fokus, durasi, status aktif |
| `workout_program_exercises` | Urutan exercise dan sets/reps pada setiap template; referensi ke katalog exercise |
| `meal_catalog` | Makanan, porsi, nutrisi, sumber, dan metadata provenance; bukan jurnal pengguna |
| `place_catalog` | Tempat olahraga, kategori gym, model akses, alamat, koordinat, tautan Maps, sumber/tanggal pemeriksaan |
| `catalog_state` | Versi katalog untuk cache/refresh client |

Perubahan katalog dilakukan administrator melalui workflow yang ditinjau,
bukan lewat `/sync/push`. Role runtime hanya diberi SELECT pada tujuh tabel ini.
`requirements` exercise menggunakan AND di dalam array dan OR antar-array:
`[["dumbbell", "bench"], ["chest_press_machine"]]` berarti dumbbell **dan**
bench, **atau** chest press machine. `movementTags` adalah anotasi pembatasan
gerak, bukan daftar otot target atau jaminan keamanan medis.

### 2.2 Identitas dan data milik akun

| Tabel | Fungsi / `entityType` untuk sync |
| --- | --- |
| `users` | ID UUID internal, mapping unik `(issuer, subject)` dari JWT, status akun; bukan entitas sync |
| `profiles` | Profil tubuh, goal, identitas gender, kemampuan, konteks latihan; `profile` |
| `training_preferences` | Mode gym/calisthenics dan alat tersedia; `training_preferences` |
| `custom_programs` | Program buatan pengguna dan jadwal; `custom_program` |
| `user_exercises` | Exercise buatan pengguna; `user_exercise` |
| `workout_sessions` | Sesi latihan, snapshot exercise, log set, status; `workout_session` |
| `user_preferences` | Preferensi budget dan area tempat; `user_preferences` |
| `place_favorites` | Tempat favorit per akun; `place_favorite` |
| `meal_entries` | Jurnal makan, porsi/waktu, snapshot nutrisi; `meal_entry` |
| `social_drafts` | Draft privat, bukan posting publik; `social_draft` |
| `legacy_user_metadata` | Metadata kompatibilitas/import lama; `legacy_user_metadata` |

`users.id` internal **tidak harus sama** dengan ID user Neon Auth/JWT `sub`.
Mobile tidak memilih kepemilikan lewat field/query `userId`. Backend mengambil
identitas hanya dari token terverifikasi dan memfilter query dengan ID internal.
Password tidak disimpan dalam `public.users`; dikelola oleh Neon Auth.

### 2.3 Data server dan pendukung

| Tabel | Fungsi |
| --- | --- |
| `nutrition_estimates` | Snapshot input/hasil estimasi per `(user_id, profile_version, formula_version)`; server-owned |
| `sync_state` | Epoch dan sequence perubahan berikutnya per akun |
| `sync_changes` | Change stream upsert/delete berurutan per akun |
| `operation_receipts` | Receipt idempotensi per akun dan `operationId` |
| `demo_imports` | Receipt/hash import data lokal/demo |
| `api_rate_limits` | Counter limiter bersama antar-instance; key HMAC, bukan token/IP mentah |
| `sync_snapshots` | Metadata snapshot immutable, cutoff stream, TTL30 menit |
| `sync_snapshot_items` | Item snapshot berposisi stabil untuk pagination/resume |
| `account_deletion_jobs` | Jadwal penghapusan 7 hari, lease/retry, ACK provider, receipt minimal |
| `revoked_identities` | Hash identitas dengan masa berlaku16 menit untuk menolak JWT lama setelah purge |
| `social_posts` | Publikasi teks community eksplisit, terpisah dari draft privat |
| `social_reports` | Laporan privat dan keputusan operator; bukan isi feed |

Data akun mengacu ke `users` melalui foreign key. Sepuluh entitas sync memiliki
version, waktu perubahan, dan tombstone `deleted_at`. Hapus melalui sync bukan
berarti langsung menghapus row fisik. Terdapat batas satu workout aktif per akun
dan satu custom program hidup per mode/hari jadwal. `weekday` memakai 1–7.
Jangan mengandalkan nomor weekday bawaan platform tanpa menyelaraskan UI.

Isolasi per-user saat ini ditegakkan backend, bukan RLS per-user pada koneksi
runtime. Jangan membuka role/koneksi backend untuk query langsung dari mobile.

### 2.4 Konfigurasi dan migration backend

Bagian ini untuk pengelola backend, bukan dijalankan oleh aplikasi mobile:

| Lokasi | Isi / batas penggunaan |
| --- | --- |
| `.env` lokal / environment Vercel | `DATABASE_URL` pooled role `musmove_runtime`, URL Auth, dan secret API |
| `.env.migrations.local` | `DATABASE_URL_DIRECT` admin untuk migration lokal; bukan file runtime Next.js |
| `.env.example` | Template tanpa kredensial asli; boleh masuk repository |
| `drizzle/` | Riwayat SQL migration dan metadata; tetap masuk repository |

Runtime membaca katalog, menulis data akun, dan memakai limiter melalui role
terbatas. Admin dipakai terpisah untuk perubahan struktur/katalog. Gunakan Node
24 dan review migration pada branch/database target sebelum menjalankan:

```bash
# Mengubah database target; jalankan hanya dari terminal/CI migration tepercaya.
npm run db:migrate
# Bila snapshot nutrisi lama belum tersedia untuk versi formula aktif:
npm run db:backfill-nutrition
```

Khusus `0019_simplify_meal_catalog`, deploy kode baru dan pastikan API katalog
tidak lagi mengirim `mealType`, `portionLabel`, dan `foodKind` **sebelum** menjalankan
migration penghapusan kolom. Mobile tidak boleh lagi mengirim filter `foodKind`
(400); gunakan `foodGroup` dan `portionGrams`. Jurnal pengguna tetap memakai
`mealType` untuk waktu makan. Detail: [penyederhanaan katalog](food-catalog.md#penyederhanaan-katalog-migrasi-0019).

Migration tidak otomatis berjalan saat API menerima request atau Vercel build.
Jangan mengunggah file migration credential ke Vercel. Backup/restore,
retention, dan penghapusan data final adalah tanggung jawab operasional;
lihat [checklist keamanan](security-vercel.md).

## 3. Alur autentikasi mobile

### 3.1 Pisahkan session Auth dan JWT API

Neon Auth mengelola session; JWT dipakai untuk request ke MusMove. Dokumentasi
provider menjelaskan session cookie dan pengambilan JWT untuk layanan eksternal.
Lihat [alur Auth](https://neon.com/docs/auth/authentication-flow) dan
[JWT provider](https://neon.com/docs/auth/guides/plugins/jwt).

**Kontrak MusMove:** `sessionToken` hasil login adalah envelope terenkripsi untuk
endpoint auth Next.js, dikirim sebagai `Authorization: Session <sessionToken>`.
`GET /auth/token` menghasilkan `accessToken`, yaitu JWT untuk API data,
dikirim sebagai `Authorization: Bearer <accessToken>`. Jangan memakai session
envelope sebagai JWT atau menyalin bentuk respons SDK/provider langsung.

### 3.2 Endpoint Auth dan kontrak native

Path berikut ditambahkan ke **`API_BASE_URL`**. Tidak ada request langsung ke
Neon dari mobile. Contoh lengkap ada di [follow-up auth](frontend-follow-up-auth-proxy.md).

| Metode dan path Auth | Kegunaan |
| --- | --- |
| `POST /auth/sign-up/email` | Body `name`, `email`, `password`; tanpa Authorization. Session mungkin null sesuai kebijakan provider. |
| `POST /auth/sign-in/email` | Body `email`, `password`; tanpa Authorization. |
| `GET /auth/get-session` | Header Session; memeriksa session dan mengembalikan envelope terbaru. |
| `GET /auth/token` | Header Session; menghasilkan `accessToken` JWT dan envelope session terbaru. |
| `POST /auth/sign-out` | Header Session; tanpa body/query, mencabut session provider. |
| `POST /auth/request-password-reset` | Body `email`; tanpa Authorization. Callback ditentukan backend. |

Gunakan `AuthRepository` untuk menyimpan envelope pada secure storage OS,
menangani single-flight restore/pengambilan JWT, dan mengganti `sessionToken`
secara atomik setiap respons sukses yang memuatnya. Client tidak mengelola
cookie Neon; proxy tidak mengirim Set-Cookie. Jangan mengirim token lewat query,
menambahkan secret server/admin ke aplikasi, atau membuat endpoint refresh sendiri.
Field `callbackURL`, `redirectTo`, role, dan URL provider pilihan client ditolak.
Server menetapkan Origin/callback HTTPS dari konfigurasi tepercaya. Error
MISSING_ORIGIN tidak diperbaiki dengan Origin localhost palsu pada Flutter.

OAuth perlu konfigurasi callback/allowlist dan alur native tersendiri. Gunakan
browser sistem serta mekanisme callback yang didukung provider; jangan menaruh
JWT/session token pada query deep link. Callback OAuth dan verifikasi email
bukan route MusMove yang otomatis tersedia. Source terbaru menyediakan halaman
web reset password; pengiriman email dan allowlist tetap konfigurasi provider.

### 3.3 Login pertama sampai onboarding

1. Mobile melakukan signup/sign-in ke `/auth/*` Next.js; selesaikan verifikasi yang
   diwajibkan konfigurasi provider.
2. Adapter menyimpan `sessionToken` secara aman dan mengambil JWT lewat `/auth/token`.
3. Mobile memanggil `GET /me` dengan `Authorization: Bearer <JWT>`.
4. Backend memverifikasi tanda tangan EdDSA, issuer/audience dari origin Auth
   yang dipin, umur/expiry token, `sub`, `role: authenticated`, dan `banned: false`.
5. Pada request privat pertama, backend membuat mapping `users` dan `sync_state`
   jika belum ada. Ini tidak otomatis membuat profil, preferences, atau histori.
6. Baca `setupCompleted`, `profile`, `trainingPreferences`, dan `versions` dari
   `/me`. Jika false, tampilkan setup; simpan jawaban belum final hanya di memori
   mobile, tanpa draft/progress backend.
7. Submit seluruh setup final melalui `POST /onboarding/complete`, dengan UUID
   `Idempotency-Key` dan `baseVersions` dari `/me`. Profil, preferensi, flag selesai,
   dan snapshot nutrisi disimpan atomik; gunakan respons kanonis server.
8. Jika sudah true, langsung masuk aplikasi. Data akun lama tidak direset.
9. Ambil `/programs/recommendations` saat diperlukan. Respons complete sudah
   menyertakan `nutritionTargets`; tidak perlu langsung GET targets lagi.

Lihat [handoff onboarding terbaru](frontend-follow-up-onboarding.md) untuk payload,
retry, konflik versi, dan field opsional. Ini menggantikan onboarding dua operasi
sync untuk integrasi baru; sync lama tetap kompatibel dan tidak dihapus. Klien
lama yang tetap offline-first boleh melanjutkan bootstrap/cursor sesuai bagian 5.

Contoh respons `GET /me` (ID ilustrasi, bukan data akun asli):

```json
{
  "user": {
    "id": "00000000-0000-4000-8000-000000000001",
    "email": null,
    "status": "active"
  },
  "setupCompleted": false,
  "profile": null,
  "trainingPreferences": null,
  "versions": { "profile": "0", "trainingPreferences": "0" }
}
```

Email nullable dan berasal dari claim token, bukan field profil yang otomatis
tersimpan di `users`. HTTP 403 `ACCOUNT_INACTIVE` berarti akun lokal tidak aktif;
jangan mencoba mengatasinya dengan loop refresh JWT.

### 3.4 Refresh, logout, dan pergantian akun

- JWT berumur pendek; backend membatasi umur sekitar 15 menit. Gunakan envelope
  melalui `/auth/token` dengan header Session untuk mendapatkan JWT baru, bukan menandatangani
  JWT di HP dan bukan memakai secret backend.
- Saat API 401, lakukan satu proses pengambilan JWT baru untuk semua request
  bersamaan (*single-flight*), lalu retry request semula paling banyak sekali.
  Untuk push, body dan `operationId` harus tetap sama pada retry tersebut.
- Jika session tidak berlaku/refresh tetap 401, hentikan sync dan tampilkan login.
  Kegagalan jaringan bukan alasan langsung menghapus data offline.
- Logout: hentikan sync, POST `/auth/sign-out` melalui Next.js, hapus JWT/material session,
  lalu tutup penyimpanan privat akun. Jika sign-out gagal karena offline,
  penghapusan lokal tidak membuktikan session provider telah dicabut.
- Pisahkan cache privat, outbox, version, dan cursor per akun dan environment.
  Jangan pernah mengirim outbox akun A dengan token akun B. Abaikan respons
  request lama bila akun sudah berganti saat request selesai.
- JWT yang sudah terbit tidak otomatis batal saat logout/ban provider;
  salinannya bisa berlaku sampai expiry. Status akun lokal dicek setiap request.

Jangan log password, JWT, cookie, foto, atau data kesehatan dalam crash reports.

## 4. Aturan request API

Semua path pada bagian berikut relatif terhadap `API_BASE_URL`.

```http
Authorization: Bearer <JWT-pengguna-dari-Neon-Auth>
Accept: application/json
Content-Type: application/json
X-Request-ID: mobile-request-id-opsional
```

Authorization wajib hanya untuk endpoint privat. `Content-Type` JSON wajib
untuk body JSON; GET tidak perlu mengirim body. Untuk foto gunakan multipart
dan biarkan HTTP library mengisi boundary, bukan menetapkan Content-Type JSON.

Native Android/iOS biasanya tidak mengirim `Origin`. Jangan menambahkan Origin
buatan/localhost. Flutter Web mengikuti CORS browser dan perlu `APP_ORIGIN`
HTTPS exact pada backend; konfigurasi native tidak otomatis mencakup web.

Versi dan sequence API dikirim sebagai **string desimal**, misalnya `"12"`;
pertahankan string atau gunakan `BigInt` bila perlu membandingkan. Jangan ubah
ke float. Cursor bersifat opaque: simpan apa adanya dan URL-encode saat dipakai.
Tanggal lokal `YYYY-MM-DD` berbeda dari timestamp ISO8601 yang wajib timezone.
Key payload memakai camelCase; nama kolom SQL snake_case bukan kontrak request.

### 4.1 Daftar endpoint lengkap

| Metode | Path | Akses | Tujuan |
| --- | --- | --- | --- |
| GET | `/meta` | Publik | Versi API/capability source dan flag publishing, bukan bukti provider siap |
| POST | `/auth/sign-up/email` | Publik | Register melalui Next.js; body name/email/password |
| POST | `/auth/sign-in/email` | Publik | Login melalui Next.js; body email/password |
| GET | `/auth/get-session` | Session | Restore dan envelope session terbaru |
| GET | `/auth/token` | Session | JWT akses data dan envelope session terbaru |
| POST | `/auth/sign-out` | Session | Logout provider; tanpa body/query |
| POST | `/auth/request-password-reset` | Publik | Permintaan reset email dengan callback server-owned |
| GET | `/catalog/exercises` | Publik | Semua exercise aktif dan versi katalog |
| GET | `/catalog/programs` | Publik | Template program, bukan hasil personalisasi |
| GET | `/catalog/equipment` | Publik | Semua alat atau pencarian `q` |
| GET | `/equipment/exercises` | Publik | Exercise sesuai `equipmentIds` dan optional `mode` |
| GET | `/catalog/meals` | Publik | Katalog pangan, search/filter/pagination |
| GET | `/catalog/places` | Publik | Tempat, filter/pagination/jarak opsional |
| GET | `/me` | Privat | Identitas akun backend saat ini |
| GET | `/sync/bootstrap` | Privat | Snapshot awal akun dan cursor |
| POST | `/sync/snapshots` | Privat | Mulai snapshot v2 immutable dengan ID client |
| GET | `/sync/snapshots` | Privat | Halaman snapshot dan handoff cursor setelah selesai |
| DELETE | `/sync/snapshots` | Privat | Lepaskan snapshot sementara milik akun |
| POST | `/sync/push` | Privat | Membuat/mengubah/menghapus sepuluh jenis entitas |
| GET | `/sync/pull` | Privat | Perubahan setelah cursor |
| POST | `/imports/demo` | Privat | Import eksplisit data lokal/demo ke akun kosong |
| GET | `/workouts` | Privat | Histori workout akun, filter tanggal/pagination |
| GET | `/programs/recommendations` | Privat | Rekomendasi berdasarkan profil, alat, kemampuan, histori |
| GET | `/nutrition/targets` | Privat | Estimasi kalori/protein tersimpan untuk profil aktif |
| GET | `/meals` | Privat | Jurnal dan rekap harian akun |
| GET | `/places` | Privat | Katalog tempat plus flag `isFavorite` akun |
| POST | `/equipment/recognize` | Privat | Kandidat alat dari satu foto; perlu konfirmasi |
| POST | `/account/deletion-requests` | Privat | Menandai permintaan penghapusan dan menonaktifkan akses lokal |
| GET | `/account/deletion-requests` | Privat, termasuk inactive | Status sendiri selama JWT masih valid |
| GET | `/social/posts` | Privat | Feed publikasi teks, bukan draft |
| POST | `/social/posts` | Privat | Publikasi eksplisit dengan postId idempotent |
| DELETE | `/social/posts` | Privat | Hapus posting sendiri |
| POST | `/social/reports` | Privat | Laporan konten privat kepada operator |

Halaman reset ada di `https://musmove-backend.vercel.app/auth/reset-password`,
**di luar** `/api/v1`. Publikasi/feed social memerlukan
`SOCIAL_PUBLISHING_ENABLED=true` setelah moderator operasional tersedia.

Tidak ada `POST /meals`, `PATCH /profile`, atau `POST /workouts`. Mutasi entitas
tersebut selalu melalui `/sync/push`.

### 4.2 Contoh pembacaan

```bash
curl --fail-with-body \
  'https://musmove-backend.vercel.app/api/v1/catalog/exercises'

# Isi MUSMOVE_ACCESS_TOKEN melalui session pengujian lokal yang aman.
# Jangan commit nilainya, memakai curl -v, atau membagikan output privat.
curl --fail-with-body \
  -H "Authorization: Bearer $MUSMOVE_ACCESS_TOKEN" \
  'https://musmove-backend.vercel.app/api/v1/me'
```

Contoh query yang valid:

```text
/catalog/meals?q=tempe&foodGroup=legumes&limit=50&offset=0
/catalog/equipment?q=dambel
/equipment/exercises?equipmentIds=dumbbell,bench&mode=gym
/catalog/places?mode=gym&gymCategory=conventional&dayPassAvailable=true
/places?latitude=-6.2&longitude=106.8&radiusKm=5&limit=50&offset=0
/meals?date=2026-10-17&limit=50&offset=0
/workouts?from=2026-10-01&to=2026-10-31&limit=25
```

Untuk places, latitude/longitude harus berpasangan; `radiusKm` memerlukan
keduanya. Jarak adalah garis lurus, bukan rute/waktu perjalanan. `dayPassAvailable:
null` berarti belum diketahui. Verifikasi akses/jam/harga dengan operator.

Pagination tidak seragam: katalog meals/places dan jurnal meals memakai offset
dan `nextOffset`/`hasMore`; workouts memakai `nextCursor`; sync memakai cursor
bertanda tangan. Jangan menukar cursor antar-endpoint. Meal catalog default 50,
places 50, meals 50, workouts 25; maksimum masing-masing 100. Simpan versi katalog
dan mulai ulang pagination katalog bila versinya berubah di tengah pengambilan.

## 5. Penyimpanan offline dan sinkronisasi

### 5.1 Model lokal yang perlu disediakan mobile

Sediakan server-shadow entitas per akun, outbox operasi pending, version server,
cursor sync, dan cache katalog. UI dapat menampilkan optimistic overlay, tetapi
jangan mengganti state pending dengan data server sebelum ACK/resolusi konflik.

| `entityType` | Aturan `entityId` |
| --- | --- |
| `profile` | Selalu `profile` |
| `training_preferences` | Selalu `training_preferences` |
| `user_preferences` | Selalu `user_preferences` |
| `legacy_user_metadata` | Selalu `legacy_user_metadata` |
| `place_favorite` | ID tempat dari katalog |
| `custom_program`, `user_exercise`, `workout_session`, `meal_entry`, `social_draft` | ID stabil buatan client; UUID disarankan |

Jangan membuat ulang entity ID setiap retry. Key exercise katalog adalah
`(mode, id)`, sehingga ID exercise tidak boleh dianggap unik lintas mode.

### 5.2 Bootstrap dan siklus sync

1. Setelah `/me`, panggil `/sync/bootstrap` bila belum ada state akun/cursor.
   Respons berisi `schemaVersion: 1`, `cursor`, serta `entities` berupa map
   sepuluh entityType ke array `{entityId, version, updatedAt, payload}`.
2. Simpan snapshot dan cursor dalam satu transaksi lokal. Bootstrap bukan
   perintah untuk menghapus outbox atau data guest secara diam-diam.
3. Bila sudah ada cursor, pull hingga `hasMore: false` sebelum mengirim edit
   baru bila online; jangan menimpa optimistic overlay/outbox tanpa rekonsiliasi.
4. Kirim outbox terurut melalui push; idealnya satu operasi in-flight per entity.
5. Evaluasi seluruh `results`, simpan ACK/version, dan tangani conflict/rejected.
6. Pull lagi dari cursor terakhir sampai selesai untuk mengambil payload
   kanonis, termasuk normalisasi profil dan snapshot nutrisi dari server.
7. Terapkan setiap halaman perubahan dan `nextCursor` secara atomik di lokal.

Jangan memajukan cursor ke `sequence` hasil push: perubahan perangkat lain
sebelum sequence tersebut bisa terlewat. Gunakan cursor dari bootstrap/pull saja.
Push tidak mengembalikan seluruh payload hasil normalisasi.

### 5.3 Contoh onboarding melalui push (legacy)

Untuk integrasi baru gunakan [POST /onboarding/complete](frontend-follow-up-onboarding.md).
Contoh lama berikut tetap kompatibel, tetapi dua operasi sync tidak menjamin
atomisitas gabungan profil + preferensi dan bukan alur setup baru.

Request ini membuat profil dan preferences pada akun kosong. ID operasi dan
nilai profil berikut hanya ilustrasi; generate UUID baru untuk operasi baru.

```json
{
  "schemaVersion": 1,
  "deviceId": "installation-acak-yang-disimpan-lokal",
  "operations": [
    {
      "operationId": "d45ca67e-f881-4ec6-85d5-e18cf49fabca",
      "entityType": "profile",
      "entityId": "profile",
      "action": "upsert",
      "baseVersion": "0",
      "payload": {
        "displayName": "Pengguna Contoh",
        "ageYears": 25,
        "weightKg": 70,
        "heightCm": 175,
        "formulaSex": "male",
        "gender": "prefer_not_to_say",
        "dailyActivity": "light",
        "goal": "bulk",
        "focus": "full",
        "trainingLevel": "beginner",
        "trainingFrequency": 3,
        "sessionMinutes": 60,
        "programSource": "app",
        "motivationEnabled": true,
        "setupCompleted": true,
        "trainingContext": {
          "healthStatus": "no_known_restrictions",
          "recoveryStatus": "recovered"
        }
      }
    },
    {
      "operationId": "d45ca67e-f881-4ec6-85d5-e18cf49fabcb",
      "entityType": "training_preferences",
      "entityId": "training_preferences",
      "action": "upsert",
      "baseVersion": "0",
      "payload": {
        "mode": "gym",
        "equipment": ["dumbbell", "bench"],
        "noEquipment": false
      }
    }
  ]
}
```

`noEquipment: true` wajib disertai array equipment kosong; false wajib array
tidak kosong. Gunakan ID alat dari katalog, bukan label bebas. Jangan menebak
gender, kondisi kesehatan, kemampuan, atau alat tersedia saat onboarding.
`gender` berbeda dari `formulaSex` untuk rumus nutrisi.

**Upsert bukan PATCH umum.** Kirim ulang state entitas lengkap saat mengedit.
Pada profil, banyak field lama yang dihilangkan menjadi null/default. Beberapa
field baru memiliki aturan preserve/merge khusus; lihat
[kontrak personalisasi](program-personalization.md). Jangan kirim hanya
`{"goal":"cut"}` karena bisa mengosongkan data profil lainnya.

### 5.4 Hasil push, idempotensi, dan konflik

Respons normal HTTP 200 dapat berisi keberhasilan sekaligus penolakan:

```json
{
  "schemaVersion": 1,
  "results": [
    {
      "operationId": "d45ca67e-f881-4ec6-85d5-e18cf49fabca",
      "status": "applied",
      "entityId": "profile",
      "entityType": "profile",
      "operation": "upsert",
      "sequence": "1",
      "version": "1"
    }
  ]
}
```

- `applied`: simpan version server dan hapus operasi tersebut dari outbox.
- `duplicate`: operasi sudah diterapkan; hasil terdahulu ada pada `result`.
- `conflict`: baca `conflict.currentVersion` dan `currentPayload`; jangan
  menganggap request berhasil. Rekonsiliasi/tampilkan pilihan pengguna, lalu
  kirim operasi **baru** dengan `operationId` baru dan version hasil rekonsiliasi.
- `rejected`: baca `error.code`; perbaiki domain/payload sebelum membuat operasi baru.

`baseVersion: "0"` hanya untuk entity yang belum pernah ada. Update/delete
memakai version server terakhir. Row tombstone tetap mempunyai version;
ID yang pernah dihapus bukan otomatis kembali menjadi versi 0.

Untuk timeout/koneksi putus/hasil belum diketahui, retry **operasi yang sama**
dengan UUID dan isi yang sama. UUID lama dengan isi berbeda ditolak
`OPERATION_ID_REUSE` jika receipt sudah tersimpan. Setiap operasi diproses dalam
transaksi terpisah, bukan satu transaksi atomik seluruh batch. Jika respons 500
terjadi di tengah batch, operasi sebelumnya mungkin sudah commit; retry sama.

Jika ada beberapa edit offline atas entity yang sama, jangan memberi semuanya
baseVersion yang sama lalu mengirim tanpa urutan ACK. Gabungkan edit yang belum
pernah dikirim, atau antrekan operasi berikutnya dengan version hasil ACK.
Operasi yang sudah mungkin terkirim tidak boleh diam-diam diubah isinya.

### 5.5 Pull, delete, dan recovery cursor

```text
GET /sync/pull?cursor=<URL-encoded-cursor>&limit=100
```

Respons berisi `schemaVersion`, `changes`, `hasMore`, dan `nextCursor`.
Setiap change mempunyai `entityType`, `entityId`, `operation`, `payload`,
`sequence`, dan `version`. Upsert mengganti server-shadow; delete menandai
entity terhapus dengan tetap mempertahankan version. Terapkan berurutan dan
hindari menurunkan version bila ACK push lebih baru daripada change yang dibaca.

Contoh operasi delete favorit, dibungkus dalam envelope push seperti di atas:

```json
{
  "operationId": "d45ca67e-f881-4ec6-85d5-e18cf49fabcc",
  "entityType": "place_favorite",
  "entityId": "jakarta-ftl-tebet",
  "action": "delete",
  "baseVersion": "1"
}
```

Delete tidak boleh membawa `payload`. Untuk membuat favorit gunakan upsert
dengan `payload: {}` dan baseVersion yang benar.

HTTP 409 `CURSOR_EXPIRED` atau HTTP 400 `INVALID_CURSOR` perlu penanganan berbeda
dari JWT expired. Periksa akun/environment/cursor tersimpan, lalu bootstrap
ulang bila diperlukan. Simpan outbox lebih dahulu dan rekonsiliasi setelah
snapshot, jangan membuang edit lokal yang belum tersinkron.

Bootstrap **legacy** `/sync/bootstrap` belum paginated: lebih dari 500 live records per entityType atau
budget JSON sumber di atas 1,5 MB menghasilkan 413 `BOOTSTRAP_LIMIT`. Jangan
menghapus histori pengguna atau retry tanpa batas untuk melewatinya. Akun besar
harus beralih ke `/sync/snapshots` v2; daftar meals/workouts bukan pengganti
penuh snapshot sepuluh entitas. Kontrak endpoint legacy tetap kompatibel.

### 5.6 Snapshot v2: ringkasan integrasi baru

1. POST `/sync/snapshots` body `{"snapshotId":"UUID-baru-client"}`. Retry start
   memakai UUID yang sama. Respons metadata schemaVersion2, snapshotId, total,
   expiresAt; TTL30 menit, maksimal2 snapshot aktif per akun.
2. GET `/sync/snapshots?snapshotId=...&limit=50`. Simpan `items` dan
   `nextPageCursor` di area snapshot sementara secara atomik, tanpa menghapus
   outbox. Item mempunyai entityType/entityId/version/updatedAt/payload.
3. Selama `complete:false`, `syncCursor:null`. Lanjutkan memakai query `cursor`
   dari nextPageCursor. Halaman yang sama dapat diulang setelah koneksi putus.
4. Hanya pada `complete:true`, pasang seluruh snapshot dan syncCursor final
   dalam satu transaksi lokal. Pertahankan outbox/optimistic overlay, lalu pull
   perubahan setelah cutoff snapshot hingga hasMore:false.
5. DELETE `/sync/snapshots?snapshotId=...` setelah commit untuk melepas salinan
   sementara. Cursor final tetap berlaku; push/pull tetap schemaVersion1.

Snapshot immutable mencegah celah saat perubahan masuk selama pagination.
Limit baru20000 live entities/32MiB sumber; halaman1–100/default50 dan budget
2MiB. 409 SNAPSHOT_EXPIRED: mulai UUID baru sambil menyimpan outbox.409
SNAPSHOT_BUSY: selesaikan/lepaskan snapshot milik perangkat sendiri.413
SNAPSHOT_LIMIT/SNAPSHOT_ENTITY_TOO_LARGE perlu dukungan, bukan menghapus histori.
Expiry menutup akses; pembersihan fisik memerlukan janitor operasional.
Contoh JSON dan alasan konsistensi ada pada hasil follow-up backend.

## 6. Alur fitur setelah login

### 6.1 Program dan workout

1. Simpan profil dan training preferences, lalu ACK/pull.
2. Panggil `/programs/recommendations`, bukan hanya katalog template.
3. Tampilkan hasil beserta `reason`, assumptions, adjustments, dan warnings.
   Preferences belum lengkap dapat menghasilkan 409 `PREFERENCES_REQUIRED`.
   Daftar kosong dengan `NO_MATCHING_PROGRAM`, `AGE_REQUIRED`,
   `ADULT_PROGRAMS_ONLY`, `RECOVERY_REQUIRED`, atau kebutuhan arahan profesional
   bukan kegagalan jaringan dan tidak boleh diganti program acak.
4. Saat mulai workout, simpan exercise terpilih sebagai `exerciseSnapshot`
   melalui entitas `workout_session`; template tidak otomatis membuat sesi.
5. Ubah log set selama status active. Setelah completed/aborted, sesi tidak
   dapat dibuka/diedit ulang lewat upsert (`WORKOUT_FINALIZED`).

Contoh payload `workout_session` minimal, dibungkus operasi upsert baru:

```json
{
  "planId": "pilihan-program-atau-rencana-lokal",
  "mode": "gym",
  "status": "active",
  "startedAt": "2026-10-17T08:00:00+07:00",
  "finishedAt": null,
  "recordedOn": "2026-10-17",
  "exerciseSnapshot": [
    {
      "id": "exercise-id-dari-hasil-pilihan",
      "idLabel": "Label exercise",
      "enLabel": "Exercise label",
      "sets": 2,
      "reps": 8,
      "targetWeightKg": null,
      "requirements": [["dumbbell", "bench"]]
    }
  ],
  "setLog": [],
  "legacyMetadata": null
}
```

ID/label di contoh workout adalah placeholder; salin nilai aktual dari program
terpilih. Validator snapshot bersifat strict: jangan langsung mengirim seluruh
objek recommendation yang mungkin mempunyai field tambahan seperti rest,
evidence, atau movement tags. Proyeksikan hanya field snapshot di atas.
Set log memakai `{exerciseId, setNumber, completed, reps, weightKg}`; reps dan
weightKg nullable, nomor set mulai 1, harus ada pada snapshot, tidak duplikat.
Sesi final wajib `finishedAt` non-null. Snapshot histori tidak mengikuti edit
katalog di kemudian hari. Jangan membuat beban angkat dari gender/BMI.

### 6.2 Target nutrisi dan jurnal makanan

Upsert profil membuat snapshot estimasi dalam transaksi yang sama. Ambil ulang
`/nutrition/targets` setelah ACK/pull perubahan profil atau goal. GET tidak
menghitung ulang/menulis database. `nutrition_estimates` bukan entitas sync.

Gunakan `estimate.calories` sebagai target akhir goal, bukan menambahkan surplus/
defisit lagi. Kebijakan produk saat ini: bulk sekitar +10% dengan cap 300 kcal,
cut sekitar −15% dengan cap 500 kcal, maintenance tanpa penyesuaian; protein default
bulk/maintenance 1,6 g/kg dan cut 2 g/kg. Ini perkiraan produk, bukan resep klinis.
Detail rumus dan guard ada di [meals/nutrition](meals-nutrition.md).

`estimate` bisa null (`PROFILE_REQUIRED`, `ESTIMATE_REBUILD_REQUIRED`) atau
berstatus `incomplete`, `unsupportedAge`, `needsReview`; jangan menampilkan
target 0 atau memakai angka stale sebagai pengganti `ready`.

Pilih makanan dari `/catalog/meals`, lalu simpan entitas `meal_entry` melalui
push. Contoh payload yang lengkap untuk makanan katalog:

```json
{
  "menuName": null,
  "note": null,
  "samplePriceRupiah": null,
  "snapshot": {},
  "catalogId": "tkpi-ap001",
  "servings": 1.5,
  "consumedAt": "2026-10-17T07:00:00+07:00",
  "recordedOn": "2026-10-17",
  "mealType": "breakfast"
}
```

TKPI memakai porsi 100 g bagian dapat dimakan: 1,5 serving berarti 150 g, bukan
1,5 piring. Backend mengambil nama/nutrisi dari katalog dan menyimpan snapshot;
client tidak boleh memaksakan nilai katalog. Untuk makanan custom gunakan
`catalogId: null` dan `nutrition` per serving yang dilaporkan pengguna, bukan
total setelah dikali serving. `servings` 0,01–20 dengan maksimal 2 angka desimal.
`mealType`: breakfast/lunch/dinner/snack. Gunakan tanggal lokal pengguna dan
timestamp bertimezone; jangan memakai tanggal UTC secara membabi buta.

Setelah ACK/pull, panggil `/meals?date=YYYY-MM-DD`. Summary mencakup seluruh
hari, bukan hanya halaman entries saat ini; jangan menjumlahkan ulang summary
setiap halaman. Demo tidak dihitung sebagai konsumsi nyata. Nutrien null berarti
tidak tersedia, bukan nol; data TKPI terlacak ke sumber, bukan uji lab setiap
porsi pengguna. Lihat [katalog pangan](food-catalog.md).

Harga katalog tersedia pada `samplePriceRupiah` dan `priceDetails` setelah migrasi
`0018` dan deployment kode terbaru. **Selalu tampilkan label estimasi**, bukan
harga terverifikasi/live. Harga numerik adalah per **100 g bagian dapat dimakan**;
contoh nasi `1400` adalah model biaya bahan, bukan harga sepiring nasi restoran.
`priceDetails.method` membedakan konversi rujukan, proksi dan model biaya;
`reference` menyimpan nama produk pembanding, URL, lokasi, tanggal dan satuan.
`checkedAt` bukan jaminan tanggal berlakunya harga. Detail ada di
[kontrak harga makanan](food-prices.md).

Untuk log katalog, harga dan `snapshot.nutritionDetails.priceDetails` ditentukan
server. Harga log tetap **per serving**, tidak otomatis dikalikan servings;
estimasi biaya log dapat dihitung `samplePriceRupiah * servings` dan harus tetap
berlabel estimasi. Edit log mempertahankan rujukan harga historis, termasuk null
pada log lama. `status: not_priced`/harga null harus tampil “tidak diberi harga”,
bukan Rp0. Demo tidak memiliki priceDetails dan tetap ilustrasi.

### 6.3 Places dan scan alat

- `/catalog/places` untuk guest; `/places` untuk akun dengan `isFavorite`.
  Favorit disimpan lewat push seperti bagian 5.5, bukan POST `/places`.
- Scan nama memakai `/catalog/equipment?q=...`; user memilih ID kanonis,
  lalu panggil `/equipment/exercises?equipmentIds=...`.
- Scan foto memakai satu field multipart `photo`, JWT API, JPEG/PNG/static WebP,
  maksimal 4 MiB dan 16 Mi-pixels. Kompres di mobile sebelum upload; jangan base64
  atau mengirim URL foto. Jangan mengirim token service AI dari mobile.
- Hasil AI wajib dikonfirmasi pengguna; `unknown` bukan exercise yang dikenali.
  Score bukan persentase akurasi. Foto tidak disimpan oleh alur backend ini.
- Service AI Python terpisah dari Vercel. Jika belum dikonfigurasi, foto 503
  bukan berarti pencarian nama/katalog juga mati. Sediakan fallback input nama;
  jangan mengklaim foto production tersedia sebelum diuji.

### 6.4 Import guest/demo dan penghapusan akun

`POST /imports/demo` menerima `{schemaVersion: 1, importId: UUID, entities: [...]}`;
setiap entity memiliki `entityType`, `entityId`, `payload`, tanpa baseVersion.
Maksimum 100 entity, harus akun kosong, dan import transaksional. Minta keputusan
pengguna sebelum memindahkan data guest ke akun. Gunakan importId/body yang
sama saat retry; import bukan merge umum. Import perlu dilakukan sebelum
onboarding menulis entitas bila ingin mempertahankan status akun kosong.
Setelah sukses, bootstrap ulang sebelum melanjutkan edit biasa.

`POST /account/deletion-requests` tidak memerlukan body dan menghasilkan 202
status deletion_requested beserta deletionRequestId, processingStatus,
requestedAt, deleteAfter, completedAt, dan waitDays:7. Hentikan sync dan tangani
sesi/cache lokal. API privat biasa menolak403, tetapi repeat POST dan GET
`/account/deletion-requests` dengan JWT valid milik identitas yang sama diizinkan.
Retry tidak memperpanjang tenggat. deletionRequestId berbeda dari X-Request-ID.

Setelah7 hari, worker operasional menghapus identity/session provider terlebih
dahulu; hanya sesudah ACK data aplikasi dipurge. Gagal provider menjadi failed/
retry, bukan izin menghapus data lokal. Hash guard berlaku16 menit untuk
mencegah JWT lama memprovisi akun lagi. Sesudah provider dihapus/JWT habis,
status dapat401; bukan tracking URL publik. Backup penyedia tidak dijanjikan
ikut terhapus otomatis.202 bukan bukti worker sudah aktif atau penghapusan selesai.

### 6.5 Social teks dan reset password baru

Draft social_draft tetap privat. Publikasi dilakukan terpisah dari sync, dengan
konfirmasi pengguna dan POST `/social/posts`:

```json
{
  "postId": "f5fe06e0-bf8c-4a32-9746-401356d9cd7c",
  "publish": true,
  "authorLabel": "Alias publik pilihan pengguna",
  "body": "Teks yang memang ingin dipublikasikan"
}
```

Retry memakai ID/body sama; ACK201 berisi postId/publishedAt/duplicate. ID lama
untuk isi berbeda409 POST_ID_REUSE; ID terhapus409 POST_DELETED. Tidak ada
auto-publish draft, media, komentar, like, atau edit pada versi awal. Alias bukan
identitas terverifikasi. GET `/social/posts?limit=20` memakai keyset signed cursor
terikat akun; render body/authorLabel sebagai **plain text**, bukan HTML aktif.

DELETE `/social/posts?postId=...` hanya milik akun, idempotent, menghapus isi/alias
dan menyisakan tombstone. POST `/social/reports` menerima postId, reason
(spam/harassment/unsafe_content/privacy/other), details opsional. Laporan privat,
bukan komentar. Role admin dari mobile tidak diterima; moderasi melalui tooling
operasional. Publikasi/feed default403 SOCIAL_NOT_ENABLED sampai flag dan
moderator siap. Batas publikasi3/10menit, laporan10/10menit plus limiter IP/akun.

Untuk reset, mobile POST `/auth/request-password-reset` pada Next.js dengan
email saja; backend menetapkan redirectTo HTTPS `/auth/reset-password`. Halaman baru menerima
capability reset, membuang query dari history, dan POST JSON ke path yang sama
untuk diteruskan hanya ke Auth yang dipin. Tidak mengembalikan JWT lewat deep link.
Password8–128 karakter, tetap tunduk pada kebijakan provider. Link expired/used,
429, dan503 ditangani tanpa log token/password; halaman no-store/CSP nonce/
no-referrer, tanpa analytics. SMTP, allowlist dan reset email nyata belum terbukti;
kebijakan email verification tidak diubah. Setelah sukses, kembali login.

Kontrak lengkap, penanganan error, dan checklist rilis kedua fitur ini ada di
[hasil follow-up](backend-follow-up-result.md).

## 7. Contoh pemanggilan dari Dart native

Contoh berikut memakai `dart:io`, hanya untuk Android/iOS, bukan Flutter Web.
Ia memanggil API dengan JWT yang **sudah didapat** dari AuthRepository; bukan
implementasi login atau refresh. Pada aplikasi sebenarnya tambahkan timeout,
pembatasan retry, single-flight refresh, dan penanganan status terstruktur.

```dart
import 'dart:convert';
import 'dart:io';

Future<Map<String, dynamic>> getCurrentUser(String accessJwt) async {
  final client = HttpClient()
    ..connectionTimeout = const Duration(seconds: 15);
  try {
    final request = await client.getUrl(Uri.parse(
      'https://musmove-backend.vercel.app/api/v1/me',
    ));
    request.followRedirects = false;
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessJwt');
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    final response = await request.close();
    final body = await utf8.decoder.bind(response).join();
    if (response.statusCode != 200) {
      // Tangani 401 lewat AuthRepository; jangan log body/header privat.
      throw HttpException('MusMove HTTP ${response.statusCode}');
    }
    return jsonDecode(body) as Map<String, dynamic>;
  } finally {
    client.close(force: true);
  }
}
```

Pisahkan Auth HTTP client dari API HTTP client. Jangan otomatis meneruskan
Authorization saat redirect ke host lain. Respons 302/login HTML biasanya
menandakan URL deployment dilindungi, bukan error JSON API.

## 8. Error, batas, dan kebijakan retry

Format error HTTP:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication is required"
  },
  "requestId": "request-id-ilustrasi"
}
```

Teks message bisa berubah; percabangan client menggunakan status dan code.
Simpan requestId untuk diagnosis tanpa menyalin token atau body privat.

| HTTP / kondisi | Respons mobile |
| --- | --- |
| 400 validation/domain/cursor | Perbaiki request atau ikuti recovery cursor; jangan retry buta |
| 401 | Ambil JWT baru sekali; login ulang bila session tidak valid |
| 403 | Cek status akun/origin; jangan memaksa refresh berulang |
| 409 | Tangani prerequisites/cursor/import sesuai code; conflict operasi sync juga bisa berada di HTTP 200 |
| 408 / timeout jaringan | Backoff terbatas; push retry memakai ID/body lama |
| 413 | Kurangi ukuran/batch/foto; BOOTSTRAP_LIMIT memerlukan penanganan khusus |
| 415 | Perbaiki MIME/body; foto bukan JSON |
| 429 | Hormati `Retry-After` dalam detik dan tambahkan jitter |
| 500/502/503 | Tampilkan gangguan; retry terbatas sesuai fitur, jangan menghapus data lokal |

Batas produksi aplikasi saat ini: 180 request/menit per IP, 120/menit per akun,
30 mutasi biasa/menit, scan foto 5/menit, bootstrap 5/menit, import 2/10 menit.
Bucket khusus handler scan/import bukan tambahan bucket mutasi biasa, tetapi
tetap memakai bucket umum IP/akun. NAT dapat menyebabkan banyak HP berbagi IP.
WAF/provider dapat menambahkan batas di luar limiter aplikasi.

Body JSON maksimal 1 MiB, payload per operasi/import 64 KiB, depth 32, push maksimal
50 operasi, pull default 100/maksimal 200 perubahan, respons JSON maksimal 3 MiB.
Unknown fields/query duplikat pada validator strict ditolak. Jangan mengirim
seluruh state aplikasi tanpa memetakan field kontrak yang didukung.

## 9. Urutan implementasi dan checklist pengujian

1. Konfigurasi base URL per environment; buat API client dan model error.
2. Implementasikan AuthRepository untuk proxy Next.js: signup/login,
   persist/restore envelope session, ambil JWT, single-flight, dan logout.
   Uji dengan akun uji yang disetujui setelah deployment/provider siap.
3. Integrasikan `/me`; pisahkan database lokal/outbox per akun.
4. Implementasikan bootstrap/pull/push, receipt, conflict, tombstone, dan retry.
5. Integrasikan onboarding, katalog, recommendations, workout, meals/nutrition,
   places/favorit; foto opsional sesudah service AI siap.
6. Uji token valid/expired, session habis, 403 akun tidak aktif, mode offline,
   timeout setelah server commit, duplicate retry, edit dari dua perangkat,
   conflict, pergantian akun saat request berjalan, 429, dan cursor invalid.
7. Uji bahwa akun B tidak melihat data A, outbox guest tidak berpindah tanpa
   persetujuan, dan logout tidak meninggalkan data privat terlihat ke akun lain.

Pengujian yang membuat akun atau menulis data sebaiknya memakai staging dan
akun sintetis, bukan akun pengguna production. Panduan ini tidak menjalankan
operasi tulis production dan tidak menambahkan kredensial ke repository.

## 10. Referensi implementasi di repository

- [OpenAPI API MusMove dan callback reset](openapi.yaml): transport dan schema field lengkap.
- [Schema database](../src/db/schema/index.ts) dan [migration](../drizzle/).
- [Verifikasi JWT](../src/lib/auth/verify-identity.ts).
- [Validator payload sync](../src/modules/sync/dto.ts) dan
  [service sync](../src/modules/sync/service.ts).
- [Personalisasi program](program-personalization.md).
- [Meals dan rumus nutrisi](meals-nutrition.md), [katalog pangan](food-catalog.md).
- [Places](places.md), [scan alat](equipment-scan.md).
- [Keamanan dan operasional Vercel](security-vercel.md).

Jika dokumentasi ringkas berbeda dari source/validator yang sudah berubah,
selaraskan implementasi dan perbarui dokumen; jangan menganggap contoh payload
sebagai izin melewati autentikasi, versioning, atau validasi server.
