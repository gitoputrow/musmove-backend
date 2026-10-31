# Follow-up frontend: program tanpa estimasi waktu

Perubahan backend ini perlu deploy, setelah migrasi database `0028` diterapkan.
Jangan ubah client production lebih dulu tanpa koordinasi rollout: backend lama
masih mewajibkan `durationMinutes` ketika membuat program custom.

Status: migrasi `0028` sudah diterapkan pada database production dan kolom
telah diverifikasi nullable. Source API belum di-deploy pada pekerjaan ini.

## Perubahan program

- `GET /api/v1/programs/recommendations` dan `GET /api/v1/catalog/programs`
  tidak lagi mengirim `durationMinutes` pada program. Rekomendasi tidak lagi
  menghitung estimasi durasi atau menolak program dengan alasan
  `SESSION_DURATION_EXCEEDED`. Pembagian, alat, kemampuan, dan target latihan
  tetap digunakan.
- Program custom tidak perlu mengirim `durationMinutes` pada create atau patch.
  Field ini tidak dikirim pada respons program baru, list, detail, schedule,
  dashboard, maupun snapshot sync baru. Bila client lama tetap mengirim angka
  valid 10–180, backend menerimanya untuk kompatibilitas tetapi mengabaikannya.
- Jangan lagi menampilkan estimasi menit di kartu program atau meminta user
  mengisi estimasi saat membuat program. Contoh create:

```json
{
  "id": "program-id",
  "data": {
    "mode": "gym",
    "name": "Latihan dada",
    "weekday": 1,
    "exercisePrescriptions": [
      {
        "id": "press",
        "idLabel": "Press",
        "enLabel": "Press",
        "sets": 3,
        "reps": 10,
        "targetWeightKg": null,
        "requirements": [["dumbbell"]]
      }
    ]
  }
}
```

Label dan requirements exercise di atas dicontohkan; server mengisi ulang
berdasarkan katalog saat penyimpanan. Respons retry idempotent untuk operasi
lama dan event sync historis tetap bisa memuat field lama: abaikan field itu.
Migration mempertahankan nilai historis di database, bukan menghapusnya.

## Yang tetap ada

Durasi workout aktual yang dicatat saat workout selesai tetap ada, termasuk
durasi total yang mencakup istirahat. `targetDurationSeconds` untuk gerakan
berbasis waktu seperti plank dan `restSeconds` saran jeda antarset tetap ada;
keduanya bukan estimasi durasi total program.

`sessionMinutes` pada profil/onboarding juga masih ada untuk kompatibilitas
data dan kontrak setup lama, tetapi tidak lagi dipakai untuk menyaring
rekomendasi. Menghapus field onboarding tersebut merupakan perubahan terpisah.

## Rollout

1. Pastikan aplikasi mobile dapat membaca respons program tanpa
   `durationMinutes`, dan hentikan pemakaian estimasi di UI. Versi lama yang
   menganggap field wajib bisa bermasalah saat backend baru aktif.
2. Jalankan migrasi `0028_program_duration_optional` pada database yang tepat;
   migrasi hanya mengizinkan nilai null dan mempertahankan seluruh nilai lama.
3. Deploy backend, lalu distribusikan/integrasikan frontend yang sesuai. Jangan
   mengirim create tanpa `durationMinutes` ke backend lama sebelum deploy.
