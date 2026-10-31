# Panduan frontend: filter katalog exercise melalui API

Filter berdasarkan otot dijelaskan dalam [panduan filter otot](frontend-filter-otot-exercise.md).

Perubahan ini ada di source backend lokal dan **perlu di-deploy** sebelum bisa digunakan di production. Endpoint lama `/api/v1/equipment/exercises` dihapus dari source: frontend yang masih memanggilnya harus dimigrasikan sebelum rollout agar fitur pencarian alat tidak rusak.

## Memfilter exercise

Gunakan `GET /api/v1/catalog/exercises` (publik):

```http
GET /api/v1/catalog/exercises
GET /api/v1/catalog/exercises?equipment=all
GET /api/v1/catalog/exercises?equipment=dumbbell
GET /api/v1/catalog/exercises?equipment=cable
GET /api/v1/catalog/exercises?equipment=machine
GET /api/v1/catalog/exercises?equipment=plate
GET /api/v1/catalog/exercises?equipment=no_equipment
GET /api/v1/catalog/exercises?equipment=plate&mode=gym
```

Tanpa `equipment`, atau dengan `equipment=all`, API mengembalikan semua exercise aktif. `mode` opsional: `gym` atau `calisthenics`. Nilai harus sesuai persis seperti contoh. Query tidak valid, tidak dikenal, atau duplikat menghasilkan HTTP 400.

Format respons tetap `{ "catalogVersion": "...", "exercises": [...] }`, sama seperti sebelumnya; field exercise dan `requirements` tetap tersedia. `catalogVersion` adalah versi seluruh katalog, bukan versi khusus hasil filter. Cache harus dibedakan berdasarkan kombinasi query; menyimpan satu hasil Plate sebagai seluruh katalog akan membuat filter lain salah. Respons menggunakan cache HTTP sehingga perubahan tidak selalu langsung terlihat.

Backend menerapkan kategori pada ID alat di semua alternatif `requirements`:

| Nilai | Aturan |
| --- | --- |
| `all` | Semua exercise aktif sesuai filter lainnya. |
| `dumbbell` | Mengandung ID `dumbbell`. |
| `cable` | Mengandung `cable_machine` atau `lat_pulldown_machine`. |
| `machine` | ID berakhiran `_machine`, kecuali cable dan plate-loaded. |
| `plate` | ID mengandung `plate_loaded`. |
| `no_equipment` | Ada alternatif kebutuhan alat kosong, misalnya `[[]]`. |

Satu exercise dapat masuk lebih dari satu filter jika memakai beberapa alat atau memiliki alternatif. Exercise dengan alat lain seperti barbell tetap muncul di All. Exercise custom tidak disertakan dalam katalog publik; frontend tetap bertanggung jawab menampilkan exercise custom user sesuai kebutuhannya. Filter mode, pilihan dan search di frontend tetap perlu disesuaikan dengan alur halaman.

## Cari berdasarkan ID alat tertentu

```http
GET /api/v1/catalog/exercises?equipmentIds=dumbbell&mode=gym
GET /api/v1/catalog/exercises?equipmentIds=dumbbell,bench&mode=gym
```

`equipmentIds` menerima 1–32 ID alat aktif, dipisah koma tanpa spasi atau duplikat. Hasil mencakup exercise yang memiliki **setidaknya satu** ID tersebut dalam salah satu grup `requirements`. Ini bukan jaminan semua alat yang diperlukan sudah tersedia. ID tidak dikenal/nonaktif menghasilkan HTTP 400 `UNKNOWN_EQUIPMENT`. `equipment`, `equipmentIds`, dan `mode` bisa digabung; semua filter yang dikirim harus cocok.

Pencarian nama alat tetap menggunakan `GET /api/v1/catalog/equipment?q=...`, kemudian gunakan ID hasil pilihan user pada `catalog/exercises?equipmentIds=...`. Katalog equipment tetap tersedia.

### Perubahan respons dari endpoint lama

Endpoint lama mengembalikan `selectedEquipment`, `ready`, `needsMoreEquipment`, `missingEquipmentOptions`, dan versi kedua katalog. Endpoint baru hanya mengembalikan `catalogVersion` dan `exercises`; **field lama tidak tersedia**. Untuk mengetahui alat yang masih kurang, frontend perlu membandingkan tiap grup `requirements` terhadap alat yang dipilih: tiap grup adalah kombinasi AND, antar grup adalah alternatif OR. Contoh `[["dumbbell", "bench"], ["cable_machine"]]` berarti dumbbell **dan** bench, atau cable machine. Grup kosong berarti tanpa alat.

Implementasi mobile lama masih memanggil endpoint yang dihapus; tim frontend perlu memperbarui alur itu dan menyesuaikan UI hasil sebelum deploy backend ini. Filter lokal lama tidak otomatis berubah menjadi request API. Untuk picker, panggil endpoint exercise dengan parameter pilihan filter dan gabungkan data custom sesuai alur aplikasi.

## Contoh data terbaru

`lat_pulldown_cable_machine` masuk Cable, `lat_pulldown_machine` masuk Machine, sedangkan `lat_pulldown_plate_loaded`, `iso_lateral_row_plate_loaded`, dan `high_iso_lateral_row_plate_loaded` masuk Plate. `high_row_machine` dan `iso_lateral_row_machine` tidak lagi muncul dalam katalog aktif; riwayatnya tetap dipertahankan.
