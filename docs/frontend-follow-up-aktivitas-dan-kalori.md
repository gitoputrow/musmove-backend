# Follow-up mobile: rutinitas aktivitas untuk estimasi nutrisi

Backend source menambahkan data rutinitas aktivitas yang **terpisah** dari
`trainingFrequency` (jumlah sesi program yang diinginkan). Tidak ada input
durasi atau intensitas olahraga, dan tidak ada perhitungan kalori per workout.
Migrasi database `0030` sudah diterapkan dan diverifikasi pada database
production. Source API dan UI mobile belum di-deploy dalam pekerjaan ini, jadi
fitur baru belum dapat digunakan di production sampai source API dirilis dan
mobile diperbarui.

## Input onboarding dan edit profil

Kirim `activityRoutine` sebagai properti di dalam `profile` pada
`POST /api/v1/onboarding/complete`, atau di `profile` pada `PATCH /api/v1/me`
dengan `baseVersions.profile` dan idempotency key seperti kontrak yang ada.

```json
{
  "activityRoutine": {
    "dailyMovement": "mostly_sitting",
    "sports": [
      { "name": "Gym", "sessionsPerWeek": 4 },
      { "name": "Boxing", "sessionsPerWeek": 1 }
    ]
  }
}
```

Contoh di atas adalah isi `profile`, bukan body lengkap onboarding. Pertahankan
field lain yang diwajibkan onboarding dan pembungkus request yang sudah ada.
Untuk tidak berolahraga, kirim `sports: []` secara eksplisit.

| `dailyMovement` | Arti di luar sesi olahraga |
| --- | --- |
| `mostly_sitting` | Kebanyakan duduk, misalnya bekerja atau belajar di depan komputer. |
| `walking_standing` | Sering berjalan/berdiri selama keseharian. |
| `physical_work` | Pekerjaan fisik berat secara rutin. |

Jangan menentukan pilihan hanya dari profesi: mahasiswa, siswa, dan pekerja
kantoran dapat memiliki rutinitas bergerak yang berbeda. Beri contoh profesi
sebagai bantuan, bukan sebagai aturan otomatis.

`sports` boleh berisi 0–7 jenis, setiap `name` 1–50 karakter dan
`sessionsPerWeek` integer 1–7. Nama yang sama (tidak membedakan huruf besar)
ditolak; tidak ada field durasi. Input tidak valid menghasilkan HTTP 400.
Saat PATCH, kirim seluruh objek rutinitas untuk mengganti isinya; penghilangan
mempertahankan data, `null` menghapusnya dan kembali ke perilaku legacy jika
`dailyActivity` lama tersedia. Tanpa rutinitas maupun `dailyActivity`, estimasi
tidak tersedia. Jangan menampilkan nilai kosong sebagai nol.

Onboarding baru dapat mengirim `activityRoutine` tanpa `dailyActivity`. Client
lama masih dapat mengirim `dailyActivity`; profil tanpa rutinitas baru tetap
memakai formula v2/faktor lama tanpa perubahan diam-diam. Jika keduanya ada,
rutinitas baru menjadi acuan estimasi; `dailyActivity` lama tidak diubah.
`sessionMinutes` masih diwajibkan onboarding lama sesuai kontrak yang ada.

## Pemilihan faktor

Jumlah sesi adalah jumlah seluruh `sessionsPerWeek`, dibatasi maksimal 7 untuk
memilih kolom tabel berikut. Ini **jumlah sesi, bukan hari olahraga**: sesi
berbeda bisa terjadi pada hari yang sama. Jenis olahraga disimpan untuk profil,
tetapi nama jenis olahraga tidak digunakan sebagai penentu intensitas/faktor.

| Keseharian | 0–1 sesi | 2–3 sesi | 4–5 sesi | 6–7 sesi |
| --- | ---: | ---: | ---: | ---: |
| `mostly_sitting` | 1,20 | 1,375 | 1,55 | 1,725 |
| `walking_standing` | 1,375 | 1,55 | 1,725 | 1,90 |
| `physical_work` | 1,55 | 1,725 | 1,90 | Perlu peninjauan |

Tabel adalah **heuristik produk**, bukan rumus tervalidasi secara individual.
Tanpa durasi/intensitas, sesi singkat dan panjang sama-sama dihitung satu,
sehingga hasil dapat terlalu tinggi/rendah; membatasi jumlah sesi ke 7 tidak
menghilangkan kemungkinan beberapa sesi terjadi pada hari yang sama. Tampilkan
sebagai estimasi, bukan kalori terukur. Kombinasi `physical_work` dan 6 sesi
atau lebih menghasilkan `needsReview` / `ACTIVITY_LEVEL_REVIEW`, bukan angka.

## Respons dan perhitungan

`GET /api/v1/nutrition/targets` serta respons onboarding/PATCH menyediakan
snapshot estimasi. Jika menggunakan rutinitas baru:

- `formulaVersion`: `mifflin-routine-goals-v3`;
- `caloriePolicy`: `goal_adjusted_v3`;
- `estimate.inputSnapshot.activityRoutine`: input rutinitas;
- `estimate.inputSnapshot.activitySelection`: `factor`, `reportedSessions`,
  `cappedSessions`, dan `method` (`weekly_sessions_heuristic_v1`);
- `estimate.maintenanceCalories`: estimasi sebelum penyesuaian goal;
- **`estimate.calories`: target final** sesudah bulk/cut/maintenance.

`activityFactors` pada respons adalah daftar faktor **legacy** v2, bukan tabel
rutinitas v3. Untuk mengetahui faktor yang dipilih pada v3, gunakan
`estimate.inputSnapshot.activitySelection.factor`.

Frontend harus menampilkan `estimate.calories` sebagai target, bukan
`maintenanceCalories`. UI lama yang secara khusus memilih maintenance pada
`goal_adjusted_v2` perlu diperbaiki. Perhitungan BMR, aturan bulk/cut/protein,
dan pengaman nutrisi yang ada tetap digunakan. Bila status bukan `ready`,
tampilkan alasan dengan bijak dan jangan mengarang angka. `GET` tidak menulis;
snapshot dihitung saat profil disimpan.

Untuk contoh uji usia 26 tahun, berat 66 kg, tinggi 166 cm, formula male, goal
bulk dan rutinitas pada contoh di atas, hasil server adalah faktor 1,55,
maintenance 2.440 kkal, target 2.680 kkal dan protein 106 g/hari. Ini hanya
contoh estimasi, bukan jaminan target cocok bagi individu.

Keterbatasan kategori aktivitas dan hasil individual: lihat [FAO](https://www.fao.org/4/y5686e/y5686e07.htm)
dan [NIH Body Weight Planner](https://www.niddk.nih.gov/bwp). Keduanya tidak
memvalidasi tabel heuristik khusus produk di atas.
