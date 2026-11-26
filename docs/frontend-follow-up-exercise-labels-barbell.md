# Nama exercise seragam dan filter Barbell

Tanggal: 25 November 2026.

Nama katalog bawaan menggunakan format **Nama Latihan (Alat)** pada `idLabel`
dan `enLabel`. Filter alat bertambah dengan nilai API `barbell`.

## Nama tampilan

| ID | Contoh enLabel baru |
| --- | --- |
| `bench_press` | Bench Press (Barbell) |
| `flat_dumbbell_bench_press` | Flat Bench Press (Dumbbell) |
| `seated_chest_press_machine` | Seated Chest Press (Machine) |
| `standing_cable_chest_press` | Standing Chest Press (Cable) |
| `chest_press_plate_loaded` | Chest Press (Plate-Loaded) |
| `smith_machine_bench_press` | Bench Press (Smith Machine) |
| `pullup` | Pull-Up (Pull-Up Bar) |
| `band_assisted_pullup` | Assisted Pull-Up (Pull-Up Bar + Resistance Band) |
| `pushup` | Push-Up (No Equipment) |

Gunakan `idLabel` untuk bahasa Indonesia dan `enLabel` untuk bahasa Inggris.
Suffix Indonesia mencakup `(Barbel)`, `(Mesin)`, `(Kabel)`, dan `(Tanpa Alat)`.
Istilah gerakan yang sebelumnya memakai bahasa Inggris tetap dipertahankan.
Variasi Incline, Decline, Single-Arm, Neutral-Grip dan sejenisnya tetap ada.
Suffix menyebut alat utama; bench, rack, atau landmine pendukung tetap ada dalam
`requirements`. Latihan berpalang, ring, kursi atau bangku tidak diberi label
No Equipment.

Seluruh 143 entri dipetakan, termasuk 2 nonaktif; katalog publik tetap berisi
141 exercise aktif. Alias lama `lat_pulldown` dan `lat_pulldown_cable_machine`
sama-sama berlabel Lat Pulldown (Cable). ID tetap berbeda untuk mempertahankan
referensi lama. Jangan menggabungkan exercise berdasarkan nama tampilan.

## Filter API

```http
GET /api/v1/catalog/exercises?mode=gym&equipment=barbell
GET /api/v1/catalog/exercises?mode=gym&equipment=barbell&muscle=chest
GET /api/v1/catalog/exercises?equipment=barbell&equipmentIds=barbell
```

Nilai `equipment`: `all`, `dumbbell`, `barbell`, `cable`, `machine`, `plate`,
`no_equipment`. Nilai query harus `barbell`; `barbel` adalah label Indonesia.
Barbell mencocokkan ID alat `barbell` pada salah satu alternatif requirements,
termasuk kombinasi dengan bench, rack atau landmine. Smith dan mesin plate-loaded
tetap terpisah. Semua filter yang dikirim digabung dengan AND.

Contoh bagian item respons:

```json
{
  "id": "bench_press",
  "mode": "gym",
  "idLabel": "Bench Press (Barbel)",
  "enLabel": "Bench Press (Barbell)",
  "requirements": [["barbell", "bench"]]
}
```

Struktur tetap `{ "catalogVersion": "...", "exercises": [...] }`, tanpa field
wajib baru. Pada data yang direview, filter barbell berisi 19 exercise gym.
Jumlah mengikuti database, bukan konstanta client. Barbell sudah ada di katalog
equipment sehingga tidak dibuat alat duplikat.

## Migrasi dan histori

Migrasi `0038_standardize_exercise_labels` memperbarui `id_label`, `en_label`,
dan `updated_at`. Versi katalog exercise meningkat sekali. Rerun tidak menaikkan
versi jika label sudah sesuai. Ketidaksesuaian identitas, requirements, atau
label dengan mapping membuat migrasi gagal agar perubahan tidak diterapkan sebagian.

ID, mode, requirements, default set/reps/durasi, tracking type, target otot,
movement tags dan status aktif dipertahankan. Exercise buatan pengguna, program
tersimpan, snapshot workout, set log dan receipt lama tidak ditulis ulang.
Histori tetap memakai nama saat dicatat; comparison tetap memakai mode/ID.

Mapping lengkap:
[`exercise-labels-2026-11-25.json`](../src/db/data/exercise-labels-2026-11-25.json).
Generator offline: `npx tsx scripts/build-exercise-label-migration.ts`.
Setelah migrasi diterapkan, perubahan berikutnya harus memakai migrasi baru.

## Integrasi dan rollout

1. Refresh cache berdasarkan `catalogVersion`, lalu tampilkan label dari API.
2. Tambahkan pilihan Barbell dengan nilai `barbell` pada UI. Untuk filter lokal,
   cocokkan requirements dengan ID alat `barbell`, bukan nama exercise.
3. Jangan menambahkan suffix lagi di frontend; nama API sudah lengkap.
4. Pisahkan cache menurut kombinasi query. Endpoint memakai cache HTTP, sehingga
   label baru bisa memerlukan refresh/revalidasi cache.
5. Deploy kode filter backend sebelum client mengirim `equipment=barbell`.
   Migrasi nama database dan deployment kode filter merupakan tahap terpisah.

Perubahan ini tidak mengedit repository frontend atau melakukan deployment.

## Hasil penerapan 25 November 2026

Migrasi `0038` sudah berhasil dijalankan pada database yang dikonfigurasi.
Verifikasi read-only memastikan 143 label diperbarui, 141 exercise tetap aktif,
seluruh atribut selain label/waktu pembaruan tetap sama, dan catalogVersion
exercise menjadi `34`. Handler API source terbaru terhadap database tersebut
mengembalikan 200 untuk filter barbell dengan 19 exercise. Kode filter belum
di-deploy oleh pekerjaan ini; deployment lama perlu diperbarui sebelum menerima
nilai query `barbell`.

76 tes terkait lulus (equipment/filter/label, online/workout/comparison, dan
migrasi Maps historis), bersama schema smoke, lint, dan typecheck. Tes migrasi
memastikan snapshot workout, program tersimpan, exercise pengguna, receipt,
dan comparison tetap terjaga; rerun SQL tidak mengubah versi katalog.
Fixture tes rotasi rekomendasi yang memakai tanggal tetap diperbarui agar selalu
berada di jendela 30 hari, tanpa mengubah algoritma rekomendasi. Verifikasi lokal
menggunakan Node 25.2.1 yang sudah tersedia; target engine proyek tetap Node 24.
