# Penghapusan meals dan daily budget

Fitur meals dan anggaran belanja harian sudah dihapus dari source backend.

- Endpoint `/catalog/meals`, `/meals`, dan `/meals/{id}` tidak tersedia.
- `meal_entry` tidak diterima oleh sync push maupun import demo dan tidak muncul di bootstrap/snapshot baru.
- `budgetRupiah` dan `budgetIsManual` tidak diterima pada user preferences, termasuk PATCH `/me`. Preferensi `placesArea` tetap tersedia.
- Dashboard tidak memiliki `meals`; statistik tidak memiliki `mealDays` atau warning `DEMO_MEALS_EXCLUDED`.
- Target kalori/protein profil melalui `/nutrition/targets` dan dashboard tetap tersedia.

Migrasi `0031_remove_meals_daily_budget` menghapus tabel `meal_entries` dan `meal_catalog`, fungsi trigger dan versi katalog meals, kolom budget, event/receipt meals, serta field budget pada event dan replay respons akun lama. Riwayat migrasi sebelumnya tetap disimpan. Data meals dan budget yang dihapus tidak dapat dipulihkan oleh migrasi ini.

Deploy perubahan API bersama migrasi tersebut, lalu jalankan `npm run db:migrate` dengan kredensial migrasi. Migrasi menghapus halaman snapshot lama dan mengganti epoch sync. Mobile harus menangani cursor lama yang tidak valid dengan bootstrap/snapshot baru, mempertahankan outbox yang masih didukung. Buang antrean operasi `meal_entry` dan field budget yang sudah tidak didukung sebelum retry; hapus menu serta penyimpanan lokal kedua fitur tersebut.

Verifikasi 14 November 2026: migrasi `0031_remove_meals_daily_budget` sudah diterapkan pada database terhubung. Tabel katalog/jurnal, trigger, kolom budget, dan data sync/replay terkait sudah tidak tersedia. Berkas sumber katalog TKPI dan referensi harga juga dihapus dari repository. Endpoint telah dihapus dari source; deployment API live belum diperbarui dalam pekerjaan ini.
