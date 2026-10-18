# Audit keamanan dan kesiapan Vercel

Tanggal pemeriksaan: **2026-10-17**. Cakupan: source Next.js API, autentikasi,
akses data antar-akun, sync/import, konsumsi resource, upload/inference,
konfigurasi database, dependency Node/Python, dan pola secret pada worktree.
Ini bukan sertifikasi, pentest independen, atau jaminan tidak ada celah.
Tidak ada deployment atau perubahan WAF/dashboard. Setelah audit, konfigurasi
lokal diperbaiki dengan role runtime baru dan dua secret independen; akun admin
lama tidak dihapus, dirotasi, atau dicabut haknya.

## Status

Pembaruan source **18 Oktober 2026**: migration0016 dan reviewed runtime grants
telah diterapkan ke database terhubung (30 tabel aplikasi). Snapshot v2,
penghapusan 7 hari/provider-first worker, social teks/moderasi, dan callback reset
ditambahkan; lihat [hasil follow-up](backend-follow-up-result.md). Preflight
lokal lolos. Source belum dipush/redeploy oleh agent; worker/jadwal/admin session
provider belum diaktifkan dan publikasi social default nonaktif. Scan foto serta
email verification dikecualikan sesuai permintaan pengguna.

**Preflight konfigurasi lokal sekarang lolos pada Node24.** Tiga blocker awal
telah diperbaiki pada database yang terhubung ke workspace:

- Role SQL `musmove_runtime` baru, tanpa hak admin, kepemilikan tabel, atau
  CREATE pada public; tujuh tabel katalog hanya dapat dibaca oleh role ini.
- `.env` menggunakan koneksi pooled role runtime dengan TLS terverifikasi.
- `SYNC_CURSOR_SECRET` dan `API_RATE_LIMIT_SECRET` masing-masing dibuat dari
  32 byte acak kriptografis, berbeda, dan tidak dicetak ke log/chat.
- Kredensial admin dipisahkan ke `.env.migrations.local`, hanya dimuat eksplisit
  oleh migration tooling. File ini bukan file environment yang dimuat Next.js.
  Kedua file secret lokal berizin0600, diabaikan Git dan dikecualikan upload Vercel.

**Pengguna telah melakukan deployment Vercel.** Pemeriksaan read-only pada
`https://musmove-backend.vercel.app` mendapatkan HTTP200 untuk lima katalog,
HTTP401 tanpa token pada `/me` dan `/nutrition/targets`, redirect HTTP ke HTTPS,
serta header keamanan API. URL deployment ber-ID masih diarahkan ke login Vercel.
Dashboard environment, WAF, dan pemisahan Production/Preview belum diinspeksi;
login/refresh mobile serta operasi tulis production belum diuji. Hasil ini
bukan pengganti audit konfigurasi dashboard atau pengujian autentikasi nyata.
Lihat [panduan database/API/Auth mobile](mobile-integration.md).

Verifikasi ulang dengan role runtime baru:10 tes keamanan, integrasi keamanan
JWT/antar-akun, sync, dan nutrisi lolos, begitu juga lint/typecheck. Percobaan
UPDATE/DELETE katalog dan CREATE pada public benar-benar ditolak PostgreSQL;
semua probe dibungkus transaksi rollback. Koneksi admin migration diuji baca
saja dan terpisah dari runtime. Tes loader memastikan file admin tidak dimuat
oleh loader environment runtime atau ketika VERCEL=1. Tidak ada data pengguna
yang dihapus atau diubah oleh setup; hanya data sintetis regresi yang dibersihkan.

Migrasi0015 untuk limiter bersama dan0016 untuk follow-up sudah diterapkan ke Neon. Preflight hanya
mencetak nama pemeriksaan, tidak mencetak URL, password, token atau isi `.env`.
`vercel.json` menjalankan `security:check` sebelum build dan memblokir kondisi
tidak aman jika muncul lagi. Jangan menghapus pemeriksaan untuk meloloskan deploy.

## Perbaikan dan pengujian

| Area | Perubahan/hasil |
| --- | --- |
| Penyalahgunaan resource lintas instance | Limiter PostgreSQL atomik; in-memory hanya development, bukan perlindungan production. Fail closed503 jika penyimpanan limiter gagal. |
| JWT | EdDSA/Ed25519, JWKS dari URL server yang dipin, issuer+audience, wajib sub/iat/exp, umur maksimal900detik (+5detik toleransi), role authenticated, banned=false, batas header8KiB. JWKS timeout/cache/cooldown. |
| Status akun | Mapping berdasarkan issuer+subject hasil verifikasi; client tidak menentukan userId. Status lokal inactive/deletion_requested menolak JWT yang masih valid. Read tidak memperbarui updatedAt akun. |
| IDOR/SQL injection | Query private ditinjau dengan filter internal userId dan parameter SQL. Tes dua akun mencakup journal, bootstrap, cursor, conflict dan delete; payload akun lain tidak bocor. Katalog hanya API read. |
| JSON/upload | JSON1MiB, depth32, batas node, operasi/import payload64KiB, MIME tepat, UTF8 valid, nilai finite, menolak null character/reserved prototype keys. Upload20detik dan cancel tidak memblokir error. |
| Foto | Maksimal4MiB + multipart64KiB; MIME/magic/decode/pixel/frame dicek; metadata EXIF/GPS dibuang. Tidak menerima URL foto, tidak menyimpan foto. Upstream produksi wajib HTTPS; redirect ditolak. |
| Resource database | Pool1–20 (default5), statement timeout10detik, lock3detik, idle transaction10detik. Import maksimal100 entri; batch push50. ResponseJSON maksimal3MiB. |
| Bootstrap | Hitung budget dalam snapshot repeatable-read sebelum transfer row: maksimal500 live records per tipe dan1.5MB JSON sumber.413 BOOTSTRAP_LIMIT, tidak memotong/menghapus data. |
| HTTP | Private response dipaksa no-store; CORS exact-origin tanpa cookie credentials; Vary Origin konsisten, nosniff, frame DENY, no-referrer, CSP ketat khusus JSON API, HSTS production, tanpa X-Powered-By. |
| Source/dependency | npm audit semua dependency:0 temuan; pip-audit environment vision:0 temuan pada tanggal audit. Scan pola source/worktree lolos; `.env` tidak dilacak. Bukan audit penuh git-history/entropy. |

JWT/JWKS diuji menggunakan **kunci Ed25519 asli yang dibuat sementara** dan
server JWKS loopback pada tes, bukan bypass/mock hasil autentikasi. Salah
tanda tangan/algoritma/issuer/audience, token expired/tanpa expiry, banned,
role salah, sub tidak valid dan request cookie-only ditolak. CRUD/rate-limit
diuji terhadap Neon menggunakan akun sintetis yang dibersihkan setelah tes.
Ini belum merupakan pengujian token mobile pengguna pada deployment Vercel.

## Deployment yang harus dilakukan pemilik

1. Gunakan **Node24.x** (dipin di package.json). Jalankan migrasi melalui
   koneksi admin terpisah, bukan saat function/build memakai role runtime.
2. Buat role login `musmove_runtime` melalui **SQL** dengan NOSUPERUSER,
   NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS; tanpa membership
   owner/neon_superuser atau role admin lainnya. Perhatikan: role yang dibuat
   lewat UI manajemen role/API/CLI Neon bisa mendapat neon_superuser secara
   default. Lihat [Neon roles](https://neon.com/docs/manage/roles).
3. Review/jalankan `scripts/runtime-role-grants.sql` sebagai admin pada branch
   target. Set password melalui cara aman, misalnya prompt `\password` pada
   psql, bukan commit password ke SQL. Role runtime sudah dibuat untuk database
   lokal yang terhubung; ulangi setup hanya pada branch lain bila diperlukan.
   Jika CREATE diwarisi dari PUBLIC/role lain,
   administrator perlu meninjau ACL/membership; REVOKE dari satu role tidak
   menghapus hak yang diwarisi. Preflight akan tetap menolak.
4. Isi **Vercel Sensitive environment variables**, masing-masing Production
   dan Preview, dengan konfigurasi berbeda:
   - `DATABASE_URL`: URL **pooled** role runtime dan `sslmode=verify-full`.
   - `NEON_AUTH_BASE_URL`: URL HTTPS branch/project Auth yang sesuai.
   - `SYNC_CURSOR_SECRET`: random minimal32 karakter.
   - `API_RATE_LIMIT_SECRET`: random berbeda, minimal32 karakter.
   - Opsional `APP_ORIGIN`: origin web HTTPS persis, tanpa slash/path.
     Untuk mobile native saja, kosongkan; jangan pakai localhost di Vercel.
   - Opsional pasangan `EQUIPMENT_VISION_URL` HTTPS + token acak bersama.
     Kosongkan **keduanya** untuk menonaktifkan foto (503), pencarian teks
     tetap berjalan. Jangan menaruh token AI dalam Flutter.
   - `DATABASE_POOL_MAX`: default5; tune berdasarkan beban dan kapasitas Neon.
5. **Jangan** menaruh `DATABASE_URL_DIRECT`, password owner/migration,
   `.env`, atau secret pada `NEXT_PUBLIC_*` di deployment. Migrations/admin
   dilakukan dari terminal/CI yang aman. Mengganti cursor secret membuat cursor
   lama invalid: mobile perlu bootstrap ulang; jangan rotasi tanpa rencana.
   Secara lokal `npm run db:migrate` dan `drizzle.config.ts` membaca
   `DATABASE_URL_DIRECT` dari `.env.migrations.local` jika belum diberikan melalui
   environment. Loader admin tidak diimpor oleh API dan tidak membaca file itu
   ketika `VERCEL=1`.
6. Pisahkan Preview dari data/Auth/secret produksi. Aktifkan Deployment
   Protection untuk preview. Lindungi akun Vercel/Neon dengan MFA dan batasi
   anggota yang dapat membaca/mengubah environment variable.
7. Konfigurasikan **Vercel WAF/rate limit** sebelum function untuk seluruh API,
   termasuk traffic tanpa JWT, dan budget/usage alerts. Limiter aplikasi
   menahan operasi tetapi setiap cache-miss masih memerlukan invocation/DB;
   bukan perlindungan volumetric DDoS atau jaminan tagihan tetap rendah.
8. Deploy setelah `security:check` lolos. Uji HTTPS, token mobile valid/expired,
  401/403, dua akun terpisah,429, upload mendekati4MiB, dan cache private pada
   **deployment sebenarnya**. Audit ini tidak mengklaim langkah itu sudah dilakukan.

Rujukan platform: [payload/function limits](https://vercel.com/docs/functions/limitations),
[Sensitive env](https://vercel.com/docs/environment-variables/sensitive-environment-variables),
[request IP headers](https://vercel.com/docs/headers/request-headers),
[WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting),
[Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions),
[Neon JWT](https://neon.com/docs/auth/guides/plugins/jwt).

## Kebijakan limiter

| Bucket | Batas awal |
| --- | --- |
| IP seluruh API |180/menit|
| Akun seluruh API |120/menit|
| Mutasi akun |30/menit|
| Foto per akun |5/menit|
| Bootstrap per akun |5/menit|
| Demo import per akun |2/10menit|

Kebijakan scan/bootstrap/import diikat ke handler, bukan ejaan URL yang dapat
dimodifikasi caller. Fixed window memakai waktu PostgreSQL, bukan waktu HP.
Tabel hanya menyimpan kunci HMAC, jumlah dan expiry; bukan IP mentah/JWT.
Pada Vercel hanya `x-vercel-forwarded-for` yang divalidasi dipercaya, tidak
header IP arbitrer dari client. Jangan menimpa header tersebut lewat proxy.
Di produksi non-Vercel, IP memakai satu bucket bersama sampai adapter proxy
tepercaya ditambahkan; tidak diam-diam mempercayai X-Forwarded-For.
Bucket usang dibersihkan terbatas25baris/request setelah24jam lewat expiry.
Tetap jadwalkan pemantauan ukuran tabel untuk traffic besar. Batas awal perlu
load test: pengguna seluler di balik NAT dapat berbagi IP.

## Batas audit dan pekerjaan operasional tersisa

- **AI Python tidak ikut deployment Next.js**. `.vercelignore` mengecualikan
  service/venv/cache model. Tempatkan di server/container privat, dengan TLS,
  shared token, firewall, batas resource dan monitoring. `127.0.0.1:8100` di
  Vercel bukan komputer lokal pengguna; jangan mengharapkannya tersedia.
- JWT bersifat stateless; logout/ban pada provider setelah JWT diterbitkan
  tidak otomatis membatalkan salinan JWT lama sampai expiry15menit. Status
  akun lokal dicek setiap request. Jika produk membutuhkan pencabutan provider
  seketika, perlu desain event sinkronisasi/introspection yang diverifikasi.
- Login/signup, reset password, MFA, email verification, captcha dan proteksi
  abuse Auth provider perlu dikonfigurasi di Neon; audit tidak mengubahnya.
- Snapshot bootstrap **legacy** tetap satu respons dengan guard lama. Source
  baru menyediakan `/sync/snapshots` v2 immutable, berhalaman/resumable dengan
  cutoff stream yang konsisten, TTL/budget dan cursor terikat akun. Mobile perlu
  beralih kontrak; akun besar tidak boleh diatasi dengan menghapus histori.
- Tidak ada RLS per-user di koneksi backend saat ini; isolasi ditegakkan oleh
  API dan diuji lintas akun. Jangan mengekspos koneksi/role backend sebagai
  Data API atau memberi kredensialnya ke mobile. RLS tambahan membutuhkan
  desain tenant context per-transaksi yang teruji, bukan sekadar ENABLE RLS.
- Retention change-log/receipt, account deletion final, backup/restore,
  observability tanpa token/foto/health data, serta incident response perlu
  dijalankan operasional. Lifecycle deletion 7 hari/provider-first telah dibuat,
  tetapi202 bukan bukti purge: worker privat, session admin dan jadwal harus
  dipasang/diamati. Backup penyedia tidak dijanjikan terhapus otomatis.
- Tidak dilakukan load test volumetric, fuzz semua dependency, scan penuh git
  history, penetrasi infrastruktur Vercel/Neon, atau pemeriksaan dashboard cloud.
  Temuan0 dependency bukan berarti0 risiko aplikasi/konfigurasi.

## Perintah verifikasi

```bash
npm run security:secrets
npm run test:security
npm run test:follow-up
npm run db:test-schema
npm run test:equipment
npm run test:vision
npm run lint
npm run build
npm run typecheck
npm audit
services/equipment-vision/.venv/bin/pip-audit --progress-spinner off
npm run security:check
```

User memilih tanpa staging; tes tulis baru memakai PGlite lokal dan JWKS
sintetis, diblokir dari fetch eksternal/Neon pool. Suite lama db:test-security,
db:test-api, db:test-nutrition dan integration lain menggunakan DB terkonfigurasi;
jangan menjalankannya terhadap production. CI baru tidak mendapat secret DB/Auth
dan tidak menjalankan migration/purge atau suite live tersebut.

Jalankan build/typecheck secara berurutan karena build meregenerasi `.next/types`.
Gunakan Node24 untuk menyamakan runtime target Vercel. Test database membuat
dan menghapus **data sintetis tes saja**, bukan data pengguna. Preflight gagal
ketika memakai owner/secret production yang tidak memenuhi syarat: itu hasil
yang diharapkan, bukan alasan untuk menonaktifkan check.
