# Hasil perbaikan GET /me HTTP 500

Tanggal: 22 Oktober 2026 (Asia/Jakarta).
Acuan mobile: [backend-me-500-report.md](../../musmove/docs/backend-me-500-report.md).

Status: migrasi database sudah berhasil diterapkan dan pembacaan profil melalui
koneksi runtime sudah lolos. Verifikasi HTTP /me dengan JWT akun mobile nyata
setelah perbaikan masih perlu dikonfirmasi. Dokumen ini khusus tindak lanjut
error /me500, bukan pengganti [panduan API frontend lengkap](frontend-follow-up-online-api.md).

## Penyebab dan bukti

Sign-in dan pengambilan token sudah berhasil menurut laporan mobile; error
berikutnya berada pada pembacaan data akun. Warning Vercel untuk request
ae2cbed0-8649-45a8-9ce1-cea3919c9d18 mencatat errorName Error dan tidak mencatat
errorCode. Source terbaru membaca profiles.focus_areas, tetapi kolom tersebut
belum tersedia pada database yang dikonfigurasi project.

Query readAccountSetup direproduksi secara read-only dengan ID sintetis yang
tidak memiliki data akun. Sebelum perbaikan, wrapper Drizzle menghasilkan Error
tanpa code luar, dengan cause PostgreSQL 42703 (undefined_column). Kolom beserta
fungsi/trigger migrasi 0021 belum ada. Profil kosong sendiri bukan kesalahan.

## Tindakan yang sudah dijalankan

Setelah pengguna meminta perbaikan database:

- Cocokkan target koneksi runtime dan migrasi (endpoint langsung/database sama),
  tanpa mencetak URL berkredensial, password, token atau nilai secret.
- Cocokkan riwayat migrasi dengan hash source. Sebelum perubahan: 21 migrasi
  cocok, tidak ada migrasi asing; hanya 0021_multi_muscle_focus yang pending.
- Jalankan workflow db:migrate menggunakan kredensial migrasi yang terpisah,
  dengan lock_timeout 5 detik dan statement_timeout 30 detik. Berhasil.
- Tidak menjalankan ulang migrasi lama, tidak menghapus/mengganti nama focus,
  tidak membuat/menghapus akun, dan tidak mereset database.
- Perintah migrator kemudian dijalankan kembali atas permintaan pengguna dan
  selesai sukses. Migrasi yang sudah tercatat dilewati, bukan diterapkan dua kali.
  Tidak ada proses migrasi yang tertinggal dari pengulangan tersebut.

Migrasi menambahkan focus_areas text[] NOT NULL, mengonversi focus lama yang
dikenal menjadi singleton, serta memasang validator dan trigger kompatibilitas.
Riwayat workout, receipt dan versi/timestamp profil tidak ditulis ulang oleh
migrasi ini. Pilihan lama yang tidak dikenal tidak ditebak menjadi full body.

## Hasil verifikasi

- 22 migrasi tercatat; seluruh hash sesuai dan tidak ada migrasi source pending.
- Kolom focus_areas tersedia; constraint tervalidasi dan trigger kompatibilitas aktif.
- Tidak ditemukan array fokus yang melanggar validator database.
- Role runtime memiliki izin SELECT/UPDATE kolom baru dan EXECUTE pada fungsi
  validator serta trigger kompatibilitas. Tidak diperlukan perluasan izin runtime.
- Query readAccountSetup melalui koneksi runtime berhasil secara read-only.
  ID sintetis tetap menghasilkan profile:null, setupCompleted:false dan versi 0;
  tidak ada profil default yang dibuat.
- Tes terisolasi: program/fokus 20, onboarding 11 dan online/OpenAPI 28 lulus.
  Tes lokal mencakup /me untuk profil belum ada maupun setup selesai.

Tidak ada perubahan payload mobile, kode handler, secret, konfigurasi provider,
push atau deployment cloud pada perbaikan database ini. Source terbaru telah
dideploy oleh pengguna; perbaikan DDL tidak memerlukan redeploy tersendiri.

Verifikasi koneksi menggunakan konfigurasi project, bukan menyalin nilai secret
dari dashboard Vercel. Belum dilakukan sign-in akun nyata oleh agen atau GET /me
production menggunakan JWT pengguna. Ulangi alur sign-in → token → /me dari
mobile; bila masih gagal, kirim requestId baru agar target environment dan log
request tersebut dapat ditelusuri. Jangan menghapus akun atau mengulangi setup
untuk menghindari error 500.

## Tindak lanjut frontend

Tidak ada perubahan kontrak atau payload untuk memperbaiki error ini. Gunakan
GET /api/v1/me dengan Authorization: Bearer <accessToken> seperti sebelumnya.
Jangan mengirim opaque sessionToken sebagai Bearer dan jangan memanggil Neon
langsung sebagai fallback.

1. Ulangi alur login → ambil access token → GET /me satu kali.
2. Pastikan /me berhasil200. Akun tanpa profil tetap memberi profile:null dan
   setupCompleted:false; akun yang sudah setup mempertahankan status tersimpannya.
   Jangan mengasumsikan semua akun harus onboarding ulang.
3. Bila profil ada, baca focusAreas sebagai array kanonis sesuai kontrak
   multi-otot; focus lama tetap tersedia sebagai proyeksi singleton atau null.
4. Jika masih500, kirim requestId baru beserta waktu kejadian dan status HTTP,
   tanpa email/password/token/cookie. Jangan otomatis mengulang register,
   menghapus akun, atau mengubah status setup untuk menghindari error.

Perbaikan ini tidak membutuhkan redeploy kode tersendiri karena yang ditambahkan
adalah struktur database yang dibutuhkan source yang sudah dideploy pengguna.
