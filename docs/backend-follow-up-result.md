# Hasil follow-up backend untuk mobile

Tanggal source: **18 Oktober 2026**. Acuan: dokumen follow-up frontend dan
[panduan integrasi](mobile-integration.md). Kontrak mesin:
[OpenAPI v1.1](openapi.yaml). Ini catatan implementasi dan batas verifikasi,
bukan pernyataan bahwa semua konfigurasi provider/production sudah selesai.

**Pembaruan auth:** register/login/session/logout dan permintaan reset kini
disediakan lewat `/api/v1/auth/*` pada Next.js. Lihat
[follow-up auth proxy](frontend-follow-up-auth-proxy.md) untuk kontrak Session
vs Bearer JWT, konfigurasi, dan status deployment. Ini menggantikan alur
direct-provider pada versi dokumen sebelumnya.

## Keputusan dan cakupan

- Pengguna meminta semua tindak lanjut selain **scan foto AI** dan
  **email verification**. Keduanya tidak diaktifkan/diubah oleh pekerjaan ini.
- Pengguna memilih tidak membuat staging. Tes tulis menggunakan PGlite lokal
  terisolasi dan JWKS/Ed25519 sintetis; bukan menulis data pengguna production.
- Masa tunggu penghapusan akun: **7 hari** sejak permintaan baru.
- Social versi awal: teks, publikasi eksplisit, feed pengguna login, hapus
  sendiri, laporan privat, dan moderasi operator. Tanpa foto/komentar/like/edit.
- Web/OAuth tetap kondisional. CORS native yang ada dipertahankan; tidak ada
  provider OAuth/callback baru yang diasumsikan tanpa keputusan produk.

## Status per item dan pemilik pekerjaan

| Item | Implementasi backend | Verifikasi/operasional yang masih dibutuhkan |
| --- | --- | --- |
| Auth/sync P0 | Verifikasi JWT, request ID, isolasi, retry/conflict/tombstone dipertahankan; suite end-to-end backend lokal ditambah | Tim mobile + pengelola: login/restore/logout dan dua perangkat terhadap layanan hidup dengan akun uji yang disetujui |
| Reset password | Halaman callback HTTPS, proxy permintaan email dan penyelesaian reset terikat Auth; validasi, rate limit, CSP/no-store/no-referrer | Pengelola provider: pengirim email dan allowlist; mobile: email saja melalui proxy, uji email nyata dan password lama ditolak |
| Bootstrap besar | Snapshot v2 immutable, pagination/resume, expiry, budget, handoff stream | Mobile mengintegrasikan kontrak baru; legacy tetap kompatibel |
| Penghapusan akun | Request/status idempotent, antrean 7 hari, provider-first purge, retry/checkpoint, revoked-identity guard | Pengelola menjadwalkan worker privat dan menyediakan session admin provider yang valid; retensi backup perlu dikonfirmasi |
| Kualitas katalog | Audit read-only struktur/provenance/unknown; harga makanan ditambahkan terpisah pada migrasi0018 sebagai estimasi berlabel | Harga per produk/lokasi pengguna tidak dijamin; detail dan batas ada pada [harga makanan](food-prices.md). Audit operator places tetap terpisah |
| Social | Publikasi teks eksplisit, keyset feed, owner-delete, private reports, CLI moderasi | Operator moderasi dan aturan komunitas harus tersedia sebelum flag publishing diaktifkan; mobile membangun UI berdasarkan kontrak |
| Scan foto/email verification | Dikecualikan | Tidak diklaim siap dari pekerjaan ini |

## 1. Snapshot bootstrap v2

### Start dan retry

```http
POST /api/v1/sync/snapshots
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{"snapshotId":"cb1ee49e-7cef-4c9c-a7ca-4f4fcb7529ef"}
```

```json
{
  "schemaVersion": 2,
  "snapshotId": "cb1ee49e-7cef-4c9c-a7ca-4f4fcb7529ef",
  "total": 651,
  "expiresAt": "2026-10-18T10:30:00.000Z"
}
```

Nilai respons di atas ilustrasi. ID dibuat client; retry ID yang sama
mengembalikan metadata snapshot yang sama selama belum expired. Tidak membuat
snapshot baru atau membatalkan snapshot perangkat lain secara diam-diam.

### Halaman dan handoff

```text
GET /api/v1/sync/snapshots?snapshotId=UUID&limit=50
GET /api/v1/sync/snapshots?snapshotId=UUID&limit=50&cursor=URL_ENCODED_NEXT_PAGE_CURSOR
```

```json
{
  "schemaVersion": 2,
  "snapshotId": "cb1ee49e-7cef-4c9c-a7ca-4f4fcb7529ef",
  "total": 651,
  "expiresAt": "2026-10-18T10:30:00.000Z",
  "items": [
    {
      "entityType": "profile",
      "entityId": "profile",
      "version": "1",
      "updatedAt": "2026-10-18T10:00:00.000Z",
      "payload": {"displayName":"Contoh","motivationEnabled":true,"setupCompleted":false}
    }
  ],
  "complete": false,
  "nextPageCursor": "OPAQUE_PAGE_CURSOR",
  "syncCursor": null
}
```

Contoh respons halaman di atas dipersingkat menjadi satu item. Setiap item berisi entityType,
entityId, version string, updatedAt, payload. Snapshot kosong memiliki total0,
complete:true dan syncCursor final pada halaman pertama.

Simpan halaman dan page cursor dalam transaksi lokal pada area snapshot
sementara. **Jangan simpan cursor sync atau mengganti seluruh state aktif dari
halaman parsial.** Pada halaman terakhir, complete:true, nextPageCursor:null,
syncCursor non-null. Pasang seluruh snapshot + cursor final secara atomik,
pertahankan outbox/optimistic overlay, lalu pull sampai selesai. Push/pull tetap
schemaVersion1, bukan2. Setelah commit lokal, lepaskan snapshot:

```text
DELETE /api/v1/sync/snapshots?snapshotId=UUID
```

Endpoint legacy `/sync/bootstrap` tidak berubah: masih satu respons dengan
batas lama. Client baru sebaiknya memakai v2; client lama tetap dapat berjalan
untuk akun kecil dan menerima413 pada batas lama.

### Mengapa konsisten

Start mengambil lock akun aktif dan sync-state, lalu membaca sepuluh tabel
entitas dalam transaksi repeatable-read yang sama. Payload yang diproyeksikan
eksplisit disalin ke tabel snapshot immutable, bersama epoch/cutoff sequence.
Perubahan sesudahnya masuk change stream setelah cutoff. Halaman tidak membaca
ulang tabel domain yang terus berubah. Versi/sequence tetap string desimal.
Cursor halaman bertanda tangan, terikat akun dan snapshot, serta tidak dapat
digunakan sebagai cursor sync. Urutan halaman stabil berdasarkan posisi.

### Batas dan recovery

- TTL akses:30 menit; maksimal2 snapshot aktif per akun, untuk dua perangkat.
- Maksimal20000 live entities dan32MiB JSON payload sumber per snapshot.
- Limit halaman1–100, default50; maksimal sekitar2MiB item per halaman.
- 409 `SNAPSHOT_EXPIRED`: snapshot unavailable/expired atau epoch berubah.
  Mulai UUID baru, hapus area snapshot parsial saja, pertahankan outbox.
- 409 `SNAPSHOT_BUSY`: dua snapshot aktif; selesaikan/lepaskan milik perangkat
  sendiri atau tunggu expiry. Jangan menghapus histori untuk melewatinya.
- 409 `SNAPSHOT_ID_UNAVAILABLE`: pilih UUID baru; tidak membocorkan akun pemilik.
- 400 `INVALID_CURSOR`: cursor salah/rusak/akun berbeda; recovery tanpa reset data.
- 413 `SNAPSHOT_LIMIT`/`SNAPSHOT_ENTITY_TOO_LARGE`: perlu dukungan, bukan retry loop.

Release menghapus salinan sementara, bukan histori. Start membersihkan snapshot
expired milik akun. Janitor operasional membersihkan salinan expired lain;
expiry akses tidak berarti penghapusan fisik tepat pada menit ke30 tanpa janitor.

## 2. Penghapusan akun 7 hari

```text
POST /api/v1/account/deletion-requests    # tanpa body/query
GET  /api/v1/account/deletion-requests    # tanpa query, identitas sendiri
```

```json
{
  "status": "deletion_requested",
  "deletionRequestId": "90ba7c0b-15b2-4812-8536-42cf52878d73",
  "processingStatus": "waiting",
  "requestedAt": "2026-10-18T10:00:00.000Z",
  "deleteAfter": "2026-10-25T10:00:00.000Z",
  "completedAt": null,
  "waitDays": 7
}
```

POST tetap202 dengan status lama, ditambah metadata. Akses API privat biasa
segera403 ACCOUNT_INACTIVE. Hanya request/status penghapusan sendiri yang
mengizinkan akun inactive dengan JWT valid. Repeat POST mengembalikan receipt
yang sama, tidak mengulang masa tunggu. Tidak ada pembatalan/aktivasi ulang
otomatis. Status suspended/deleted tidak dapat membuat permintaan baru.

Worker privat memproses job setelah deleteAfter:

CLI execute lebih dahulu memeriksa `/api/v1/meta` pada domain production,
memastikan v1.1.0/deletedIdentityGuard sudah live. Bila API masih versi lama,
redirect/protected, atau tidak dapat diperiksa, worker menolak purge. Ini
mencegah token lama memprovisi akun lewat deployment yang belum diperbarui.
Domain default adalah production MusMove; custom domain dapat ditetapkan dengan
`MUSMOVE_API_BASE_URL` HTTPS pada konfigurasi operational, tanpa secret di URL.

1. Claim dengan lock/lease; job tidak diproses dua worker secara bersamaan.
2. Cabut session dan hapus identitas melalui API admin Neon Auth yang dipin.
3. Simpan checkpoint providerDeletedAt; kegagalan provider mempertahankan data
   aplikasi dan menjadwalkan retry, bukan dianggap berhasil.
4. Dalam satu transaksi: lock identitas, simpan hash guard16 menit, hapus user
   aplikasi dengan FK cascade (termasuk snapshot/social/data sync), dan simpan
   receipt selesai tanpa userId. Guard mencegah JWT lama membuat mapping baru.
5. Janitor menghapus hash expired dan receipt selesai setelah7 hari.

Hash guard tidak menyimpan email, subject atau issuer mentah; ini metadata
keamanan sementara. Receipt tanpa userId hanya berisi ID job, status/timestamp,
counter/error code generik. Backup, access logs dan disaster recovery penyedia
berada di luar purge SQL aplikasi: pengelola perlu mengonfirmasi retensinya.
Jangan menjanjikan semua salinan backup hilang pada hari ke7.

GET status bukan tracking publik permanen: provider deletion, JWT expiry atau
guard dapat menghasilkan401. UI harus memperlakukan ini sebagai hilangnya
session, bukan mengirim outbox kembali. Request ID HTTP berbeda dari ID receipt.

### Menjalankan worker (belum otomatis dijadwalkan oleh repo)

Gunakan Node24 di mesin/runner tepercaya, di luar runtime API Vercel. Simpan
koneksi admin pada `.env.migrations.local`; simpan **session cookie admin Neon
Auth yang valid** sebagai `NEON_AUTH_ADMIN_COOKIE` pada `.env.operations.local`
atau secret manager runner. Jangan kirim credential ke chat/Git, dan gunakan
izin file0600. Cookie ini bukan API key control-plane Neon atau JWT pengguna.
Session admin dapat expired dan perlu pembaruan; kegagalannya harus dipantau.
Lihat [Admin provider](https://neon.com/docs/auth/guides/plugins/admin).

```bash
# Read-only: jumlah due requests dan legacy requests yang belum punya job.
npm run accounts:deletions

# DESTRUKTIF: hanya setelah review dry-run dan konfigurasi provider benar.
# Maksimal10 job due/run, provider harus memberi ACK sebelum purge lokal.
npm run accounts:deletions -- --execute --confirm=DELETE_DUE_ACCOUNTS
```

Jadwalkan command execute hanya setelah kebijakan/sesi admin/jadwal dipasang
pengelola; monitor exit code dan failed jobs. Worker juga membersihkan snapshot
expired, hash guard, dan receipt expired. Request legacy yang belum terantre
direkonsiliasi saat execute dan diberi minggu pengaman baru, bukan langsung purge.
Tidak ada cron cloud atau provider-user deletion yang dijalankan oleh audit ini.
**Tanpa jadwal/credential tersebut,202 tidak menjamin penghapusan final berjalan.**

## 3. Social teks, privasi, dan moderasi

Aktifkan `SOCIAL_PUBLISHING_ENABLED=true` di API hanya setelah operator dan
aturan komunitas siap. Default false menolak publikasi/feed dengan403
SOCIAL_NOT_ENABLED. Owner-delete dan laporan tetap tersedia untuk konten lama.
Semua endpoint memerlukan JWT pengguna; draft privat tidak dipindahkan otomatis.

```json
{
  "postId": "f5fe06e0-bf8c-4a32-9746-401356d9cd7c",
  "publish": true,
  "authorLabel": "Alias publik pilihan pengguna",
  "body": "Teks yang memang ingin dipublikasikan"
}
```

POST `/api/v1/social/posts` menghasilkan201 `{postId,publishedAt,duplicate}`.
postId dibuat client untuk retry idempotent; body berbeda409 POST_ID_REUSE,
ID terhapus409 POST_DELETED. `publish:true` dan alias eksplisit menghindari
publikasi profil/draft tanpa persetujuan. Body maksimal2000 karakter, alias80,
tanpa mengambil email/nama/health context dari profil privat.

GET `/api/v1/social/posts?limit=20` menghasilkan `{items,nextCursor}`; maksimum50.
Item hanya postId, authorLabel, body, createdAt, isMine. Cursor signed terikat
akun, keyset createdAt/id (termasuk presisi timestamp); refresh untuk posting
baru yang masuk selama traversal. Penulis inactive, posting deleted/hidden tidak
masuk feed. Render body/alias sebagai **plain text**, bukan HTML aktif.

DELETE `/api/v1/social/posts?postId=...`: owner-only, idempotent. Isi/alias
dibersihkan; tombstone minimal mencegah replay publish lama. Akun lain404
POST_NOT_FOUND. Belum ada media, komentar, like, edit, atau auto-publish offline.

POST `/api/v1/social/reports` body:

```json
{"postId":"f5fe06e0-bf8c-4a32-9746-401356d9cd7c","reason":"spam","details":null}
```

Reason: spam/harassment/unsafe_content/privacy/other; details maksimal1000.
Respons202 `{status:"received",duplicate:boolean}`. Satu laporan tersimpan per
akun/post; pengulangan tidak menimpa laporan pertama. Own post400 OWN_POST_REPORT.
Laporan/reporter/detail tidak disertakan feed. Tidak ada endpoint moderator
publik atau role admin yang bisa dikirim mobile.

Moderasi memakai koneksi admin terpisah melalui CLI:

```bash
npm run social:moderate
npm run social:moderate -- --report-id=UUID --inspect
# Review konten privat di terminal aman, jangan simpan/log-kan output ke publik.
npm run social:moderate -- --report-id=UUID --action=hide
npm run social:moderate -- --report-id=UUID --action=hide --operator=OPERATOR_REF --execute
# action=dismiss menyelesaikan laporan tanpa menyembunyikan posting.
```

Tanpa execute, keputusan hanya dry-run. Action/operatorRef/waktu disimpan pada
laporan resolved. Runtime API tidak diberi UPDATE laporan, dan tidak dapat
menetapkan status moderator lewat payload. Moderasi ini manual, bukan klasifikasi
konten otomatis atau jaminan seluruh konten berbahaya sudah tersaring.

Publikasi3 percobaan/10menit, laporan10/10menit, plus limiter IP/akun umum.
Retry juga memakai kuota; gunakan backoff/Retry-After, bukan polling rapat.

## 4. Reset password tanpa perubahan email verification

Callback web setelah redeploy:

```text
https://musmove-backend.vercel.app/auth/reset-password
```

Mobile meminta email melalui **Next.js** `/api/v1/auth/request-password-reset`,
body `email` saja. Backend menetapkan redirectTo URL di atas; client tidak
mengirimnya. Jangan menambahkan `/api/v1` pada alamat callback web.
Pengelola harus mengizinkan domain/redirect dan mengonfirmasi pengirim email.
Dokumentasi: [reset password Neon](https://neon.com/docs/auth/guides/password-reset).

Halaman memproses reset capability provider, menghapus query dari history,
meminta password baru dua kali, dan POST JSON `{token,newPassword}` ke path web
yang sama. Password8–128 karakter, tunduk pada kebijakan provider. Proxy hanya
memanggil Auth yang dipin, tidak membawa cookie admin/JWT pengguna, memvalidasi
ACK provider, membatasi ukuran/timeout reply, dan tidak mencetak rahasia.

Halaman no-store/no-referrer/CSP nonce, tanpa analytics/script pihak ketiga;
body/password/token tidak ditampilkan pada log aplikasi. Jangan aktifkan
pencatatan query URL lengkap pada platform untuk jalur reset. Token reset
bukan JWT/session token dan tidak digunakan sebagai query deep link mobile.

400 RESET_REJECTED mencakup link invalid/expired/used atau password tidak sesuai
policy;429 RESET_RATE_LIMITED perlu menunggu;503 AUTH_UNAVAILABLE atau timeout
perlu mencoba login dengan password baru sebelum retry karena hasil bisa tidak
diketahui. Sukses mengarahkan pengguna kembali login, bukan auto-login lewat URL.
Batas proxy5 percobaan/10menit/IP. Email verification tidak diubah/dinonaktifkan.

**Belum teruji dengan email nyata:** pengiriman, redirect allowlist, pemakaian
ulang link, dan penolakan password lama. Pengguna memilih tanpa staging; lakukan
uji layanan hidup hanya dengan akun/recipient yang memang disetujui pemilik,
bukan email acak atau data pengguna biasa. Tes lokal memakai provider sintetis.

## 5. Hasil audit katalog read-only

Audit awal pada 18 Oktober 2026, sebelum migrasi harga0018 (`npm run catalogs:audit`):

- 18 places aktif: 0 lokasi/provenance struktural tidak valid, 0 model akses
  tidak konsisten; 16 day-pass unknown tetap null. Tanggal pemeriksaan sumber
  tersimpan 11 Oktober 2026; ini bukan verifikasi ulang ke operator hari ini.
- 1.145 makanan referensi/13 kelompok: 0 metadata provenance wajib hilang;
  0 harga referensi yang diklaim sebagai harga pasar. TKPI bukan sumber harga.
- 117 exercise aktif: 0 movement tags kosong.

Jam buka/fasilitas/harga gym belum dimodelkan; tidak ditambahkan dengan tebakan.
Budget makanan tetap input manual opsional; rekomendasi berbasis budget belum
ditambahkan. Tindak lanjut harga0018 menambahkan1.125 estimasi dengan sumber
harga terpisah dan20 pengecualian, bukan1.125 harga individual terverifikasi.
Lihat [kontrak harga makanan](food-prices.md) untuk satuan, metode dan batasnya.
Audit struktur tidak membuktikan sebuah link operator masih benar/terbaru.

## 6. Rollout dan verifikasi

Pelaksanaan pada18 Oktober2026: migration0016 dan grants sudah diterapkan ke
database yang terhubung, preflight lolos. Tidak ada data pengguna yang dihapus.
Dry-run worker menunjukkan0 due requests dan0 legacy requests belum terantre;
mode execute tidak dijalankan, tidak ada identitas provider yang dihapus.
Source belum dipush/redeploy oleh agent. Halaman reset diuji melalui server
lokal hasil production build:200 HTML, nonce baru per request, no-store,
no-referrer, query token tidak dipantulkan ke HTML, tanpa script eksternal.

1. Untuk branch/database lain, review/apply migration0016 menggunakan koneksi admin, lalu jalankan ulang
   `scripts/runtime-role-grants.sql` sebagai admin. Enam tabel baru; katalog dan
   histori lama tidak dibuang. Request penghapusan lama diberi minggu pengaman.
2. Jalankan `npm run security:check`; build Vercel memblokir schema/grants kurang.
   Jangan menaruh DATABASE_URL_DIRECT/NEON_AUTH_ADMIN_COOKIE di runtime Vercel.
3. Redeploy source terbaru. Jangan menganggap perubahan lokal sudah live.
4. Konfirmasi callback reset/provider; email verification/scan foto tetap di luar
   cakupan. Atur moderator dan worker privat sebelum mengaktifkan fitur terkait.
5. Mobile mengadopsi snapshot v2, metadata deletion, dan social eksplisit.
   Client lama tetap memakai bootstrap/push/pull lama tanpa perubahan otomatis.

Tes lokal otomatis yang disediakan (`npm run test:follow-up`) mencakup:

- JWT Ed25519 asli/JWKS loopback, dua akun, receipt/duplicate/conflict/tombstone.
- Snapshot650 meal entries dengan payload di atas1,5MB, replay halaman,
  update/delete/create setelah start, handoff stream tanpa hilang/duplikat.
- Budget halaman, dua snapshot aktif, expiry/epoch, cursor akun lain.
- Onboarding ACK, target bulk kanonis, rekomendasi program dan nutrisi makanan
  server-authoritative.
- Draft tidak masuk feed, owner-delete, report privat, hide, signed feed cursor
  presisi timestamp, feature flag dan429/Retry-After.
- Runtime grants tidak bisa menulis revoked guard atau menyelesaikan moderasi.
- Tunggu7 hari, provider gagal tanpa purge, retry/purge, JWT lama tidak
  memprovisi ulang, akun lain tetap aktif.
- Provider deletion/reset sintetis: pinned URL, redirect ditolak, tidak
  meneruskan credential pengguna/admin yang salah,404 route bukan ACK delete.

Workflow `.github/workflows/backend-checks.yml` menjalankan pemeriksaan lokal
Node24 pada push/PR tanpa secret database/provider, tanpa deploy/purge/migration.
Actions dipin ke commit dari repository resmi, permissions contents:read dan
checkout tanpa persist credential. Workflow baru tetap perlu dilihat hasilnya
di GitHub setelah push; keberadaan YAML bukan bukti run cloud sudah sukses.

Jalankan pula test:security, db:test-schema (PGlite lokal), lint/typecheck,
build, dan security:secrets. **Jangan menjalankan suite `db:test-*` yang memakai
Neon terkonfigurasi untuk uji tulis pada production.** Suite lokal baru tidak
membaca DATABASE_URL atau menghubungi provider nyata. Katalog audit read-only
terpisah. Belum ada bukti login pengguna asli, email nyata, atau dua perangkat
hidup dari hasil lokal ini; tidak ada klaim pentest/load-test atau0 risiko.
