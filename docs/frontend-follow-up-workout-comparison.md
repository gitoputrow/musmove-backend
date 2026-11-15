# Perbandingan workout dengan latihan sebelumnya

Tanggal: 15 November 2026.

Pembaruan kontrak `item.setLog`: hasil set sekarang
[dikelompokkan berdasarkan exercise](frontend-follow-up-workout-grouped-set-log.md).
Field `comparison`, pemilihan histori, dan perhitungan delta pada dokumen ini
tetap sama.

Summary workout sekarang bisa menampilkan hasil sesi sebelumnya dan selisih per
set, misalnya chest press hari ini 30 kg × 7 reps dibanding terakhir 25 kg × 8 reps:
frontend menerima selisih beban `5` dan repetisi `-1`.

## Endpoint dan respons

Field baru `comparison` berada di level teratas respons:

- `POST /api/v1/workouts`: respons 201 setelah workout selesai disimpan.
- `GET /api/v1/workouts/{id}`: respons 200 untuk detail/summary workout milik akun.

Keduanya memakai Bearer JWT. POST tetap memerlukan UUID `Idempotency-Key` dan
payload final yang sudah ada. Jangan mengirim `comparison` dalam request;
field tersebut dihitung server. Tidak ada request tambahan saat menyimpan.

Contoh bagian `comparison` untuk exercise satu set; field `item` dan `exercises`
pada respons POST tetap tersedia seperti sebelumnya:

```json
{
  "comparison": {
    "version": "1",
    "basis": "previous_completed_workout",
    "exercises": [
      {
        "exerciseId": "seated_chest_press_machine",
        "exerciseMode": "gym",
        "previousWorkout": {
          "id": "previous-workout-id",
          "startedAt": "2026-11-13T10:00:00.000Z",
          "finishedAt": "2026-11-13T11:00:00.000Z",
          "recordedOn": "2026-11-13"
        },
        "setCount": {
          "current": 1,
          "previous": 1,
          "delta": 0
        },
        "sets": [
          {
            "setNumber": 1,
            "current": {
              "trackingType": "repetitions",
              "completed": true,
              "weightKg": 30,
              "reps": 7,
              "durationSeconds": null
            },
            "previous": {
              "trackingType": "repetitions",
              "completed": true,
              "weightKg": 25,
              "reps": 8,
              "durationSeconds": null
            },
            "delta": {
              "weightKg": 5,
              "reps": -1,
              "durationSeconds": null
            }
          }
        ]
      }
    ]
  }
}
```

ID exercise selalu mengikuti snapshot workout; contoh tidak membentuk ID baru.
Gunakan `exerciseId` bersama `exerciseMode` untuk memasangkan hasil ke UI.

## Cara backend memilih sesi sebelumnya

Untuk setiap exercise dalam snapshot saat ini, backend mencari sesi akun yang
sama dengan pasangan `(exerciseMode, exerciseId)` yang sama, tanpa membatasi
ke program atau sumber manual/custom/recommended tertentu.

Sesi pembanding harus:

1. Berstatus `completed` dan belum dihapus.
2. Mulai sebelum waktu mulai sesi saat ini dan selesai paling lambat pada waktu
   mulai sesi saat ini; sesi yang masih tumpang tindih tidak dipakai.
3. Sudah selesai menurut waktu server, sehingga catatan masa depan tidak dipakai.
4. Memiliki set `completed=true` untuk referensi exercise tersebut, dengan nomor
   set di dalam rentang set snapshot sebelumnya.

Backend memilih sesi dengan `finishedAt` paling baru, lalu `startedAt` dan ID
descending sebagai penentu jika waktunya sama. Sesi sebelumnya bisa berasal dari
hari yang sama atau beberapa hari/minggu lalu; frontend sebaiknya menggunakan
label **“Latihan terakhir”**, bukan selalu “Kemarin”.

Setiap exercise bisa mempunyai sesi pembanding berbeda. Latihan yang tidak
dikerjakan pada sesi paling baru tidak menghalangi backend menemukan sesi
terakhir yang mengerjakan exercise itu. ID yang sama pada `gym` dan
`calisthenics` tetap dua identitas terpisah; histori legacy tanpa mode per
exercise memakai mode sesi. Label/nama exercise bukan kunci pencarian.

## Pemasangan set dan nilai nullable

Setiap `comparison.exercises[]` memiliki `setCount` untuk membandingkan jumlah
set yang benar-benar **tercatat completed**, terpisah dari perbandingan beban
dan repetisi per nomor set. Misalnya hari ini 4 set completed, terakhir 3:

```json
{
  "setCount": {
    "current": 4,
    "previous": 3,
    "delta": 1
  }
}
```

Frontend dapat menampilkan `↑ 1 set`. Sebaliknya, 3 dibanding 4 menghasilkan
`delta: -1` untuk `↓ 1 set`. Jumlah yang sama menghasilkan `0`. Jika belum ada
latihan pembanding, `previous` dan `delta` bernilai `null`.

Jumlah ini menghitung log unik yang valid, sesuai pasangan mode/ID exercise dan
rentang nomor set snapshot. Set belum selesai, tidak tercatat, bernomor di luar
rentang, salah referensi, atau mempunyai duplikat ambigu tidak dihitung. Set
completed dengan beban/repetisi belum diketahui tetap dihitung. Jadi target
4 set dengan hanya 2 log completed menghasilkan `current: 2`, bukan 4. Tanpa
log completed yang valid, `current: 0`. Tidak mengasumsikan set yang tidak dicatat
benar-benar dilakukan. Perubahan tracking type tidak menghalangi perbandingan
jumlah set, tetapi tetap membuat delta beban/reps/durasi antarjenis menjadi null.

`sets` mengikuti jumlah set pada snapshot saat ini, berurutan mulai dari 1.
Set 1 selalu dibandingkan dengan set 1, set 2 dengan set 2, dan seterusnya.
Backend tidak mencari sesi yang lebih lama untuk melengkapi nomor set yang
tidak ada pada sesi pembanding terpilih.
Jika hari ini 4 set sedangkan sebelumnya 3, set ke-4 memiliki `previous: null`
dan delta metrik null. Jika hari ini 3 sedangkan sebelumnya 4, rincian hanya
memuat 3 nomor set saat ini; `setCount.previous` tetap menghitung keempat set
completed sebelumnya dan menunjukkan pengurangan lewat `setCount.delta`.

| Field | Makna |
| --- | --- |
| `previousWorkout` | Identitas/waktu sesi sebelumnya, atau `null` jika tidak ada; `recordedOn` bisa `null` untuk histori lama |
| `setCount` | Jumlah set completed saat ini dan sebelumnya beserta selisih; tidak menghitung target yang belum dilakukan |
| `current` | Actual log set saat ini, atau `null` jika set belum dicatat |
| `previous` | Actual log nomor set yang sama pada sesi pembanding, atau `null` jika tidak ada / referensi duplikat ambigu |
| `trackingType` | `repetitions` atau `duration`; nilai legacy yang tidak dicatat dianggap `repetitions` |
| `delta.weightKg` | Beban actual saat ini dikurangi beban actual sebelumnya, dibulatkan hingga 6 desimal |
| `delta.reps` | Repetisi actual saat ini dikurangi repetisi actual sebelumnya |
| `delta.durationSeconds` | Waktu tahan actual saat ini dikurangi waktu tahan actual sebelumnya |

Selisih hanya dihitung jika kedua set completed dan tracking type sama.
Set yang belum completed, tidak mempunyai log, atau berbeda tracking type
menghasilkan delta `null`. Tiap metrik juga independen: beban yang belum dicatat
tidak menghalangi perbandingan repetisi yang diketahui. Nilai `0` adalah hasil
yang sah; `null` berarti belum diketahui dan tidak boleh diubah menjadi 0.
Repetisi selalu `null` pada set duration; durasi selalu `null` pada set repetitions.
Target program, berat badan, dan beban bantuan tidak dipakai untuk menebak hasil.

Jika belum ada histori, `previousWorkout` dan `previous` bernilai `null`,
semua delta bernilai `null`, sementara `current` tetap dikembalikan jika tercatat.
Sesi legacy active/aborted menghasilkan `comparison.exercises: []`.

## Tampilan frontend

- `delta.weightKg > 0`: tampilkan `↑ 5 kg`.
- `delta.weightKg < 0`: tampilkan `↓ 5 kg` menggunakan nilai absolut.
- `delta.weightKg === 0`: tampilkan `0 kg` atau “Tetap”.
- `delta.weightKg === null`: tampilkan `—` atau “Belum ada pembanding”.

Terapkan pola yang sama untuk repetisi dan detik. Tampilkan beban dan repetisi
bersama agar penambahan beban tidak otomatis dianggap peningkatan keseluruhan;
contoh di atas juga menunjukkan repetisi turun dari 8 menjadi 7.
API mengembalikan angka bertanda, bukan string berisi panah atau warna.
Untuk jumlah set gunakan `setCount.delta` dengan pola panah yang sama.

## Histori, retry, dan rollout

Data `item`, snapshot, set log, `resultMetrics`, versi workout, serta alur simpan
final tetap sama. `comparison` tidak ditulis ke kolom workout, sync payload,
atau respons list `GET /workouts`. Untuk summary dari list, ambil detail melalui
`GET /workouts/{id}`. Belum ada preview sebelum submit.

Pada POST, comparison dibaca dalam transaksi simpan yang sama dan ikut tersimpan
di receipt idempotency. Retry body/ID/key yang sama mengembalikan respons asli,
termasuk comparison aslinya. Receipt historis yang belum memiliki field tersebut
tetap direplay persis; client harus mengizinkan `comparison` absen pada replay
lama dan bisa mengambil detail setelah sukses jika membutuhkannya. Receipt yang
memiliki comparison tetapi belum memiliki `setCount` juga direplay tanpa perubahan;
gunakan GET detail untuk memperoleh perbandingan jumlah set terbaru.

Pada GET detail, comparison dihitung dari histori yang tersedia saat dibaca.
Backfill atau penghapusan sesi sebelumnya dapat mengubah hasil comparison,
tanpa mengubah data/versi workout yang sedang dilihat. Ini bukan snapshot
perbandingan permanen pada workout. Akun lain tidak bisa membaca pembanding
atau memakai ID workout untuk mengakses data akun pemiliknya.

Tidak memerlukan migrasi database, dependency, atau konfigurasi baru. Perubahan
ini berada pada source backend; belum di-deploy dan belum mengubah kode frontend.
Kontrak lengkap ada di [OpenAPI online](openapi-online.json).
