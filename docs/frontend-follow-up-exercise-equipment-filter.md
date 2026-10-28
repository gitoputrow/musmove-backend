# Katalog plate-loaded dan filter alat pada pemilihan exercise

28 Oktober 2026. Migrasi `0025_plate_loaded_chest_press` menambah enam
exercise gym: Incline Chest Press Plate Loaded, Chest Press Plate Loaded,
Decline Chest Press Plate Loaded, Seated Incline Chest Press Plate Loaded,
Seated Chest Press Plate Loaded, dan Seated Decline Chest Press Plate Loaded.

Tiga equipment canonical berdasarkan sudut: `incline_plate_loaded_chest_press_machine`,
`plate_loaded_chest_press_machine`, dan `decline_plate_loaded_chest_press_machine`.
Masing-masing dipakai oleh dua variasi, berada pada mode gym, dan memiliki alias
nama. ID/nama exercise yang sudah ada dipertahankan, bukan ditimpa. Enam data
baru memiliki `movementTags` shoulder/elbow/wrist dan target utama chest;
shoulders/triceps adalah target pendukung, bukan data aktivasi yang terukur.

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

API tidak memiliki query filter atau field kontrak baru. Katalog exercise dan
equipment tetap menggunakan `catalogVersion`; trigger menaikkan versinya ketika
migrasi menambah data. Client perlu menyegarkan cache katalog setelah migrasi.
Tidak ada perubahan autentikasi, histori, durasi, volume, atau nutrisi.
