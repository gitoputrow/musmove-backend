# Workout: setLog dikelompokkan per exercise

Tanggal: 15 November 2026.

`setLog` pada kontrak API workout sekarang berisi satu grup untuk setiap pasangan
`(exerciseMode, exerciseId)`. Hasil tiap set berada di `sets`, sehingga ID dan
mode exercise tidak perlu diulang pada setiap set.

## Bentuk setLog

```json
{
  "setLog": [
    {
      "exerciseId": "seated_chest_press_machine",
      "exerciseMode": "gym",
      "sets": [
        { "setNumber": 1, "completed": true, "weightKg": 30, "reps": 7 },
        { "setNumber": 2, "completed": true, "weightKg": 25, "reps": 8 }
      ]
    },
    {
      "exerciseId": "pullup",
      "exerciseMode": "calisthenics",
      "sets": [
        { "setNumber": 1, "completed": true, "weightKg": 0, "reps": 8 }
      ]
    }
  ]
}
```

`exerciseSnapshot` tetap memuat identitas, label, target, mode, serta metadata
exercise. `setLog` memuat hasil yang dilaporkan. Pasangkan keduanya berdasarkan
mode dan ID, bukan posisi array. ID sama pada gym dan calisthenics tetap dua grup.

## Request final

`POST /api/v1/workouts` tetap satu submit setelah selesai, dengan Bearer JWT dan
UUID `Idempotency-Key`. Contoh format manual bebas mode:

```json
{
  "id": "workout-20261115-001",
  "source": "manual",
  "startedAt": "2026-11-15T08:00:00.000Z",
  "finishedAt": "2026-11-15T09:00:00.000Z",
  "recordedOn": "2026-11-15",
  "sessionTiming": { "source": "timer" },
  "exerciseSnapshot": [
    {
      "id": "seated_chest_press_machine",
      "mode": "gym",
      "idLabel": "Chest Press Mesin",
      "enLabel": "Seated Chest Press Machine",
      "requirements": [["chest_press_machine"]],
      "sets": 2,
      "reps": 8,
      "targetWeightKg": null,
      "trackingType": "repetitions"
    }
  ],
  "setLog": [
    {
      "exerciseId": "seated_chest_press_machine",
      "exerciseMode": "gym",
      "sets": [
        { "setNumber": 1, "completed": true, "weightKg": 30, "reps": 7 },
        { "setNumber": 2, "completed": true, "weightKg": 25, "reps": 8 }
      ]
    }
  ]
}
```

Label/requirements pada snapshot tetap dikanonisasi backend dari katalog atau
exercise milik akun. Format ini menghilangkan top-level `mode` dan mewajibkan
`mode` pada setiap snapshot serta `exerciseMode` pada setiap grup.

Untuk program/custom/recommended atau format lama manual satu mode, top-level
`mode` tetap digunakan dan snapshot tetap tanpa mode per exercise. Pada grup,
`exerciseMode` boleh dihilangkan (mengikuti mode workout) atau diisi mode yang
sama. Group mode yang berbeda dari mode workout ditolak. Validasi sumber,
programId, ownership dan pembuatan `newExercises` tetap berlaku.

## Validasi

| Bagian | Aturan |
| --- | --- |
| Jumlah grup | Maksimal 12; pasangan mode/ID harus unik |
| Referensi grup | Wajib cocok dengan exerciseSnapshot; grup kosong pun divalidasi |
| `sets` | Maksimal 10 hasil per grup |
| `setNumber` | Bilangan bulat 1–10, unik dalam grup, tidak melebihi jumlah set snapshot |
| Isi tiap set | `setNumber`, `completed`, `reps`, `weightKg`, dan opsional `durationSeconds` |
| Identitas dalam set | Jangan kirim `exerciseId` atau `exerciseMode` lagi di dalam `sets` |
| Bentuk array | Jangan mencampur grup dan entri flat dalam satu `setLog` |
| Set kosong | `sets: []` diterima untuk grup valid, lalu tidak dimasukkan ke log hasil tersimpan; tanpa log menghasilkan `setLog: []` |

`reps` dan `weightKg` tetap wajib berupa angka yang valid atau null; bukan target
otomatis. Untuk duration, gunakan `reps: null` dan `durationSeconds` 1–3600 atau
null/tidak dikirim jika belum diketahui. Hasil nol pada repetitions atau beban
tetap sah. Nilai null tetap unknown. Seluruh aturan pengukuran sebelumnya berlaku.
Pelanggaran struktur atau referensi menghasilkan 400 tanpa menyimpan sebagian
workout/exercise/receipt.

## Respons dan kompatibilitas

Respons baru berikut selalu mengelompokkan `item.setLog` atau `items[].setLog`:

- POST workout yang berhasil membuat receipt baru.
- `GET /api/v1/workouts/{id}`.
- `GET /api/v1/workouts`, termasuk pembacaan histori lama.

Group order mengikuti kemunculan pertama dalam log; urutan set di dalam grup
dipertahankan. Jangan bergantung pada urutan grup agar sama dengan snapshot.
Untuk histori single-mode, mode grup diambil dari mode sesi jika log lama belum
memilikinya. Referensi log lama yang tidak cocok dengan snapshot tetap dibaca,
tidak dibuang. Jika ada histori mixed yang rusak dan tidak memiliki mode set,
mode grup menjadi null agar backend tidak menebak identitasnya. Respons workout
baru yang valid selalu memiliki mode gym/calisthenics pada setiap grup.

Request flat lama masih diterima. Backend menormalisasi request grup menjadi log
internal flat untuk perhitungan, penyimpanan, change stream dan idempotency.
Tidak ada migrasi atau penulisan ulang histori. Statistik, resultMetrics dan
comparison memakai hasil actual yang sama. Schema/format legacy sync tidak diubah.

Retry memakai body, ID workout, dan key yang sama. Receipt historis tetap direplay
persis; jika dahulu responsnya memakai setLog flat, respons retry tetap flat.
GET detail/list menyediakan proyeksi grup tanpa mengubah receipt atau versi
workout. Jangan membentuk request retry baru dari respons GET atau mengganti
bentuk/urutan array sambil memakai key lama.

`comparison.exercises[].sets`, `setCount`, dan arti delta tidak berubah.
`exercises` di level teratas respons POST tetap khusus exercise baru yang dibuat
bersama workout, bukan daftar grup set.

## Status

Source backend, kontrak OpenAPI dan tes diperbarui. Belum di-deploy dan belum
mengubah frontend. Parser frontend perlu membaca grup setLog sebelum perubahan
respons ini diaktifkan. Tidak ada migrasi database, env, atau dependency baru.

Referensi: [perbandingan workout](frontend-follow-up-workout-comparison.md),
[OpenAPI online](openapi-online.json), dan
[kontrak pengukuran](frontend-follow-up-workout-result-metrics.md).
