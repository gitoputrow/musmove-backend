# Katalog plate-loaded dan filter alat pada pemilihan exercise

> Catatan: laporan historis ini mendeskripsikan filter lokal. Kontrak backend terbaru dan rencana migrasi frontend ada di [panduan filter exercise](panduan-frontend-filter-exercise.md).

Pembaruan: 29 Oktober 2026.

## Status

- Migrasi `0025_plate_loaded_chest_press` sudah dijalankan pada database yang
  digunakan API produksi. Pada 29 Oktober, `GET /api/v1/catalog/exercises`
  mengembalikan keenam exercise baru dengan `catalogVersion:"29"` dan
  `GET /api/v1/catalog/equipment` mengembalikan tiga alat baru dengan
  `catalogVersion:"3"`. Versi dapat bertambah jika katalog berubah lagi.
- Filter sudah diimplementasikan di project mobile lokal untuk Record Workout
  dan editor program. Perubahan UI memerlukan aplikasi dijalankan/dibangun
  ulang; status distribusi ke perangkat lain belum diverifikasi.
- File migrasi dan dokumentasi backend masih berupa perubahan lokal yang belum
  di-commit/push ketika laporan ini diperbarui. Data database sudah tersedia;
  jangan menjalankan INSERT manual atau membuat enam exercise duplikat.

## Exercise baru

Seluruhnya `mode:"gym"`, `trackingType:"repetitions"`, dengan default
3 set × 10 reps. `idLabel` dan `enLabel` saat ini sama seperti nama di tabel.

| ID exercise | Nama | Equipment ID pada requirements |
| --- | --- | --- |
| `incline_chest_press_plate_loaded` | Incline Chest Press Plate Loaded | `incline_plate_loaded_chest_press_machine` |
| `chest_press_plate_loaded` | Chest Press Plate Loaded | `plate_loaded_chest_press_machine` |
| `decline_chest_press_plate_loaded` | Decline Chest Press Plate Loaded | `decline_plate_loaded_chest_press_machine` |
| `seated_incline_chest_press_plate_loaded` | Seated Incline Chest Press Plate Loaded | `incline_plate_loaded_chest_press_machine` |
| `seated_chest_press_plate_loaded` | Seated Chest Press Plate Loaded | `plate_loaded_chest_press_machine` |
| `seated_decline_chest_press_plate_loaded` | Seated Decline Chest Press Plate Loaded | `decline_plate_loaded_chest_press_machine` |

Contoh item dari `GET /api/v1/catalog/exercises`:

```json
{
  "id": "chest_press_plate_loaded",
  "mode": "gym",
  "idLabel": "Chest Press Plate Loaded",
  "enLabel": "Chest Press Plate Loaded",
  "defaultSets": 3,
  "defaultReps": 10,
  "trackingType": "repetitions",
  "defaultDurationSeconds": null,
  "requirements": [["plate_loaded_chest_press_machine"]],
  "muscleTargets": {
    "version": "1",
    "primary": ["chest"],
    "secondary": ["shoulders", "triceps"]
  }
}
```

Tiga equipment canonical berdasarkan sudut: `incline_plate_loaded_chest_press_machine`,
`plate_loaded_chest_press_machine`, dan `decline_plate_loaded_chest_press_machine`.
Masing-masing dipakai oleh dua variasi, berada pada mode gym, dan memiliki alias
nama. ID/nama exercise yang sudah ada dipertahankan, bukan ditimpa. Enam data
baru memiliki `movementTags` shoulder/elbow/wrist dan target utama chest;
shoulders/triceps adalah target pendukung, bukan data aktivasi yang terukur.
`movementTags` ada pada database, tetapi **tidak** disertakan oleh endpoint
catalog exercises saat ini; jangan membuat parser frontend mewajibkan field itu.

## Filter di mobile

Halaman pemilihan exercise untuk Record Workout dan program memiliki filter
All, Dumbbell, Cable, Machine, Plate, dan No Equipment. Filtering dilakukan
secara lokal berdasarkan grup `requirements` yang sudah tersedia di katalog,
tanpa API request tambahan. Cable mencakup cable machine dan lat pulldown;
Machine menunjukkan mesin konvensional/Smith; Plate untuk mesin plate-loaded.
No Equipment berlaku bila ada alternatif requirements kosong. Custom exercise
dengan alat yang belum diketahui hanya ditampilkan pada All; barbell dan alat
lain yang tidak memiliki filter khusus juga tetap dapat ditemukan di All.
Pilihan filter dan pencarian digabung; filter tidak mengubah data atau pilihan
exercise yang sudah disimpan. Daftar kandidat program masih dibatasi oleh mode
dan ketersediaan alat, sesuai aturan aplikasi sebelumnya.

Klasifikasi menggunakan ID alat pada setiap alternatif `requirements`, bukan
nama exercise. Suatu exercise bisa memenuhi lebih dari satu filter bila ada
alternatif kebutuhan berbeda. Untuk data saat ini:

| Filter | Aturan |
| --- | --- |
| All | Semua exercise yang tersedia dalam konteks picker, termasuk custom, barbell, dan alat lain tanpa filter khusus. |
| Dumbbell | Salah satu alternatif memuat `dumbbell`, walaupun juga memerlukan `bench`. |
| Cable | Memuat `cable_machine` atau `lat_pulldown_machine`. |
| Machine | ID berakhiran `_machine`, kecuali ID cable dan plate-loaded. Smith machine termasuk di sini. |
| Plate | ID alat mengandung `plate_loaded`; termasuk enam exercise baru. |
| No Equipment | Ada alternatif requirements kosong (`[]`); custom yang alatnya tidak diketahui tidak masuk kategori ini. |

Filter default adalah All ketika picker dibuka. Search dan filter aktif secara
bersamaan; mengubah filter tidak menghapus teks pencarian atau exercise yang
sudah dipilih. Pilihan satu exercise tetap menutup picker seperti sebelumnya.

Implementasi mobile lokal:

- `lib/features/workout/domain/exercise_equipment_filter.dart`
- `lib/features/workout/presentation/record_exercise_selection_page.dart`
- Label ID/EN di `lib/l10n/app_id.arb` dan `lib/l10n/app_en.arb`.

## Integrasi dan verifikasi

API tidak memiliki query filter atau field kontrak baru. Katalog exercise dan
equipment tetap menggunakan `catalogVersion`; trigger menaikkan versinya ketika
migrasi menambah data. Client perlu menyegarkan cache katalog setelah migrasi.
Tidak ada perubahan autentikasi, histori, durasi, volume, atau nutrisi.

Checklist untuk frontend:

1. Refresh cache exercise dan equipment ketika `catalogVersion` berubah; jangan
   menanam enam item ini sebagai daftar statis atau menambah endpoint filter.
2. Gunakan equipment IDs di atas untuk pilihan alat; pastikan preferensi alat
   pengguna mencakup mesin yang sesuai bila editor program membatasi kandidat.
3. Uji filter bersama search, termasuk custom unknown, alat lain di All,
   alternatif requirements kosong, serta dua exercise dengan mode/ID berbeda.
4. Jalankan ulang aplikasi untuk memuat label dan UI baru; cek ID/EN, dark/light,
   layar kecil, dan teks besar.

Pada implementasi 28 Oktober, tes backend online (45), katalog/equipment (17),
dan program (26) lulus; schema smoke, lint, dan typecheck lulus. Tes mobile
alur terkini (17) dan editor program (8), serta tes filter (5) lulus; Flutter
analyze dan pemeriksaan visual 320px/200% lulus. Suite mobile lama
`workout_record_widget_test.dart` memiliki 10 kegagalan karena fixture/test-nya
belum mengikuti alur Record Workout terbaru; jangan menganggap suite itu lulus.
Tidak ada uji perangkat fisik atau rilis aplikasi mobile pada pekerjaan ini.
