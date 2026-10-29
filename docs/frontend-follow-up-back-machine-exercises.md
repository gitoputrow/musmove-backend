# Follow-up katalog lat pulldown dan plate-loaded row

> Filter API terbaru dijelaskan di [panduan filter exercise](panduan-frontend-filter-exercise.md); uraian filter lokal di bawah merupakan kondisi sebelumnya.

29 Oktober 2026. Migrasi `0026_lat_pulldown_plate_rows` menambahkan lima
exercise gym, dengan default 3 set × 10 repetisi dan target otot kanonis.

Migrasi sudah diterapkan pada database production. API production telah
diverifikasi: kelima exercise dan empat equipment baru muncul, sedangkan dua
exercise lama tidak lagi muncul di katalog aktif. Versi katalog exercise saat
verifikasi adalah `31` dan equipment `4`.

| ID exercise | Nama | Equipment ID | Filter mobile |
| --- | --- | --- | --- |
| `lat_pulldown_cable_machine` | Lat Pulldown Cable Machine | `lat_pulldown_machine` | Cable |
| `lat_pulldown_machine` | Lat Pulldown Machine | `lat_pulldown_standard_machine` | Machine |
| `lat_pulldown_plate_loaded` | Lat Pulldown Plate Loaded | `lat_pulldown_plate_loaded_machine` | Plate |
| `iso_lateral_row_plate_loaded` | Iso Lateral Row Plate Loaded | `iso_lateral_row_plate_loaded_machine` | Plate |
| `high_iso_lateral_row_plate_loaded` | High Iso Lateral Row Plate Loaded | `high_iso_lateral_row_plate_loaded_machine` | Plate |

`lat_pulldown_machine` pada kolom equipment adalah ID alat kabel **yang sudah
ada**, sedangkan ID exercise yang bernama sama adalah exercise baru kategori
Machine dengan requirement `lat_pulldown_standard_machine`. ID milik tabel yang
berbeda tidak saling menggantikan. Nama gerakan dengan ID `lat_pulldown` yang
sudah ada dipertahankan dan tetap memakai alat kabel lama.

`high_row_machine` dan `iso_lateral_row_machine` **sebagai exercise** menjadi
nonaktif sehingga hilang dari katalog exercise aktif dan pencarian alat. Data
exercise tidak dihapus fisik, sehingga histori dan snapshot yang sudah tercatat
tetap dapat dibaca. Dua equipment dengan ID serupa tetap ada untuk menjaga
referensi/preferensi alat lama; perubahan ini bukan permintaan menghapus alat.
Tidak ada template program bawaan aktif yang mengacu pada dua exercise tersebut
pada pemeriksaan sebelum migrasi. Program milik user dan riwayat tidak ditulis
ulang; pemilihan/pembuatan baru harus memakai exercise yang masih aktif.

Filter mobile existing menggunakan ID `requirements`: lat pulldown kabel
masuk Cable, alat `lat_pulldown_standard_machine` masuk Machine, dan ketiga
alat yang mengandung `plate_loaded` masuk Plate. Seluruhnya juga ada di All.
Program custom tetap membatasi pilihan menurut preferensi alat; user mungkin
perlu memilih alat standar atau plate-loaded yang baru di pengaturan latihan.
Refresh cache catalog sesuai `catalogVersion`; tidak ada parameter API atau
request tambahan yang perlu dibuat.

Pemetaan otot: tiga pulldown menargetkan `lats` dengan `biceps` dan `upperBack`
sebagai pendukung; dua row menargetkan `upperBack` dan `lats`, dengan `biceps`
dan `shoulders` sebagai pendukung. Ini klasifikasi katalog, bukan pengukuran
aktivasi otot user.
