# Follow-up frontend: filter otot dan penghapusan estimasi waktu program

Pembaruan: 1 November 2026.

Dokumen ini untuk integrasi mobile terkait dua perubahan backend: filter exercise
berdasarkan otot dan penghapusan estimasi durasi program.

## Status dan urutan rollout

- Source backend untuk kedua perubahan sudah dibuat dan diuji secara lokal,
  tetapi **belum di-deploy** pada saat laporan ini dibuat. Jangan menganggap
  endpoint baru sudah tersedia di production.
- Migrasi database `0028_program_duration_optional` sudah diterapkan pada
  database production. Nilai durasi program lama tetap tersimpan.
- Frontend perlu siap membaca program tanpa `durationMinutes` sebelum backend
  baru diaktifkan. Versi mobile lama yang menganggap field itu wajib bisa
  mengalami error setelah deploy.
- Backend lama masih mewajibkan `durationMinutes` saat create program custom.
  Jangan mengirim create tanpa field itu sebelum backend baru aktif.
- Tidak ada perubahan UI mobile dalam pekerjaan backend ini. Source dan file
  migrasi masih perlu disertakan dalam commit/deploy.

## 1. Filter exercise berdasarkan otot

### Ambil daftar pilihan

```http
GET /api/v1/catalog/muscles
```

Endpoint publik ini mengembalikan dua grup beserta ID dan label dalam bahasa
Indonesia dan Inggris. Contoh respons berikut **dipersingkat**:

```json
{
  "catalogVersion": "1",
  "groups": [
    {
      "id": "upper_body",
      "idLabel": "Tubuh atas",
      "enLabel": "Upper Body",
      "muscles": [
        { "id": "chest", "idLabel": "Dada", "enLabel": "Chest" },
        { "id": "biceps", "idLabel": "Bisep", "enLabel": "Biceps" }
      ]
    },
    {
      "id": "lower_body",
      "idLabel": "Tubuh bawah",
      "enLabel": "Lower Body",
      "muscles": [
        { "id": "quadriceps", "idLabel": "Paha depan", "enLabel": "Quadriceps" }
      ]
    }
  ]
}
```

Pilihan lengkap yang tersedia:

| Grup | ID otot |
| --- | --- |
| Upper body | `chest`, `shoulders`, `biceps`, `triceps`, `forearms`, `abs`, `obliques`, `upperBack`, `lats`, `lowerBack` |
| Lower body | `glutes`, `quadriceps`, `hamstrings`, `calves` |

Core (`abs`, `obliques`, `lowerBack`) dikelompokkan di upper body untuk UI.
ID bersifat case-sensitive. Daftar pilihan ini berasal dari source backend,
bukan tabel database. Versi pada endpoint ini terpisah dari versi katalog
exercise. **Belum ada gambar atau URL gambar otot di respons**; ilustrasi
untuk UI perlu disediakan frontend dan dipetakan berdasarkan ID.

Neck, Traps, Abductors, dan Adductors seperti pada referensi desain belum
tersedia sebagai kategori terpisah di data exercise; jangan menampilkannya
seolah-olah filter spesifik untuk keempatnya sudah tersedia.

### Ambil exercise yang cocok

```http
GET /api/v1/catalog/exercises?bodyPart=upper_body
GET /api/v1/catalog/exercises?bodyPart=lower_body&muscle=quadriceps
GET /api/v1/catalog/exercises?muscles=chest,triceps
GET /api/v1/catalog/exercises?muscles=chest,quadriceps&equipment=dumbbell&mode=gym
GET /api/v1/catalog/exercises?muscle=triceps&muscleRole=any
```

- Gunakan `muscle` untuk satu ID atau `muscles` untuk beberapa ID dipisahkan
  koma tanpa spasi; jangan kirim keduanya bersamaan.
- Beberapa pilihan menggunakan **OR**: exercise muncul jika cocok dengan
  minimal satu otot yang dipilih. Exercise yang cocok lebih dari satu pilihan
  tetap hanya muncul sekali.
- Pilihan lintas upper/lower boleh dilakukan dengan `muscles` tanpa `bodyPart`.
  Jika `bodyPart` dikirim, semua otot yang dipilih harus berada dalam grup itu.
- Secara default yang dicocokkan adalah otot utama. `muscleRole=secondary`
  memakai otot pendukung; `muscleRole=any` memakai utama atau pendukung.
- Filter otot digabung dengan filter alat dan mode menggunakan **AND**. Query
  tidak valid atau duplikat menghasilkan HTTP 400.
- Respons tetap berbentuk `{ "catalogVersion": "...", "exercises": [...] }`.
  Exercise tanpa data otot tidak muncul saat filter otot aktif. Exercise custom
  user bukan bagian katalog publik dan perlu ditangani terpisah di mobile.
- Cache berdasarkan keseluruhan query; `catalogVersion` exercise adalah versi
  seluruh katalog, bukan versi khusus hasil filter.

Detail lengkap: [panduan filter otot](frontend-filter-otot-exercise.md).

## 2. Penghapusan estimasi waktu program

### Program dari aplikasi

`GET /api/v1/programs/recommendations` dan `GET /api/v1/catalog/programs`
tidak lagi mengirim `durationMinutes` pada program. Backend tidak lagi
menghitung estimasi durasi atau menolak rekomendasi karena alasan
`SESSION_DURATION_EXCEEDED`. Fokus, alat, kemampuan, dan pertimbangan lain
tetap digunakan.

### Program buatan sendiri

Saat membuat atau mengubah program custom, frontend **tidak perlu mengirim**
`durationMinutes` setelah backend baru aktif. Field itu juga tidak disertakan
dalam respons program baru, daftar/detail program, schedule, dashboard, atau
snapshot sync baru. Nilai 10–180 yang masih dikirim client lama diterima untuk
kompatibilitas tetapi diabaikan.

Hapus tampilan estimasi menit dari kartu program dan input estimasi pada form
buat/edit program. Respons retry idempotent dan event sync yang sudah tersimpan
sebelum perubahan masih bisa membawa `durationMinutes`; abaikan field itu.
Nilai historis di database tidak dihapus.

### Durasi yang tetap digunakan

- **Durasi aktual workout** tetap dicatat saat workout selesai, termasuk waktu
  istirahat, sesuai alur Record Workout yang sudah ada.
- `targetDurationSeconds` tetap digunakan untuk gerakan berbasis waktu seperti
  plank. `restSeconds` tetap menjadi saran istirahat antarset.
- `sessionMinutes` di profil/onboarding masih dipertahankan untuk kompatibilitas
  kontrak lama, tetapi tidak lagi dipakai untuk menyaring rekomendasi program.

Detail payload create dan rollout: [panduan program tanpa estimasi waktu](frontend-follow-up-program-tanpa-estimasi-waktu.md).

## Checklist frontend

1. Buat parser program yang tidak mewajibkan `durationMinutes`; abaikan field
   lama jika masih diterima.
2. Koordinasikan deployment dan distribusi aplikasi; kirim create tanpa
   durasi hanya setelah API backend baru aktif.
3. Ambil `/catalog/muscles`, tampilkan pilihan per grup dan izinkan multi-select.
4. Kirim pilihan sebagai `muscles=id1,id2`, termasuk pilihan lintas grup, dan
   gabungkan dengan filter alat/mode sesuai kebutuhan.
5. Uji clear filter, multi-select, search bersama filter, hasil kosong, dan
   latihan custom. Pastikan durasi workout aktual tetap dapat dicatat.

Verifikasi lokal backend: tes filter otot, migrasi program, 26 tes program,
46 tes online, typecheck, dan lint lulus. Ini bukan hasil uji mobile atau
verifikasi API production setelah deploy.
