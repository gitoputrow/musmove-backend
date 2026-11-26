# Mode lari (running) di record workout

Tanggal: 26 November 2026.

Record workout punya mode ketiga, **Lari**, di samping Gym dan Calisthenics. Mode
ini memakai endpoint yang sama, `POST /api/v1/workouts`, dan tetap mengikuti pola
yang sudah ada: data dikirim **sekali saat Finish**. Tidak ada request start,
update live, atau kirim titik GPS bertahap.

Status (26 November 2026): migrasi `0039_running_workouts` sudah diterapkan di
database Neon, dan backend yang berisi fitur ini sudah di-deploy. Frontend sudah
bisa mulai memakai mode lari.

## Dua sub-mode

| | Current (live) | Past (input manual) |
|---|---|---|
| Alur di app | User menekan Start, timer dan GPS berjalan, lalu Finish | User mengisi waktu, durasi, dan jarak |
| `sessionTiming` | `{ "source": "timer" }` | `{ "source": "user_reported", "durationSeconds": 1800 }` |
| `run.distanceSource` | `"gps"` | `"manual"` |
| `run.movingSeconds` | Wajib: waktu bergerak tanpa pause | Tidak dikirim |
| `run.route` | Wajib: encoded polyline | Tidak dikirim |
| `run.splits` | Opsional | Tidak dikirim |

Aturan umum untuk keduanya:

- `source: "run"` dan `mode: "running"`.
- `exerciseSnapshot: []` dan `setLog: []` dikirim sebagai array kosong.
- Jangan kirim `programId` atau `newExercises`.
- Header `Authorization: Bearer <jwt>` dan `Idempotency-Key: <uuid>` wajib.
- Jangan kirim pace, kecepatan, atau bounds. Semuanya dihitung server, dan field
  yang tidak dikenal akan ditolak 400.

## Contoh request: current (GPS)

```json
{
  "id": "run-6d1f3c2a",
  "source": "run",
  "mode": "running",
  "startedAt": "2026-11-26T06:00:00+07:00",
  "finishedAt": "2026-11-26T06:35:00+07:00",
  "recordedOn": "2026-11-26",
  "exerciseSnapshot": [],
  "setLog": [],
  "sessionTiming": { "source": "timer" },
  "note": "Easy run",
  "run": {
    "version": "1",
    "distanceSource": "gps",
    "distanceMeters": 5200,
    "movingSeconds": 1872,
    "splits": [
      { "index": 1, "distanceMeters": 1000, "seconds": 360 },
      { "index": 6, "distanceMeters": 200, "seconds": 72 }
    ],
    "route": {
      "encoding": "polyline5",
      "polyline": "f`xd@_ewjS?Q?S?Q...",
      "pointCount": 812
    }
  }
}
```

Isi `splits` di atas dipotong untuk contoh. Kalau dikirim, `index` harus
berurutan dari 1 tanpa loncat.

## Contoh request: past (manual)

```json
{
  "id": "run-91ab77e0",
  "source": "run",
  "mode": "running",
  "startedAt": "2026-11-25T17:00:00+07:00",
  "finishedAt": "2026-11-25T17:30:00+07:00",
  "recordedOn": "2026-11-25",
  "exerciseSnapshot": [],
  "setLog": [],
  "sessionTiming": { "source": "user_reported", "durationSeconds": 1800 },
  "run": { "version": "1", "distanceSource": "manual", "distanceMeters": 5000 }
}
```

## Respons 201

```json
{
  "item": {
    "id": "run-6d1f3c2a",
    "mode": "running",
    "planId": "run",
    "status": "completed",
    "exerciseSnapshot": [],
    "setLog": [],
    "legacyMetadata": { "source": "run", "note": "Easy run" },
    "runLog": {
      "version": "1",
      "distanceSource": "gps",
      "distanceMeters": 5200,
      "movingSeconds": 1872,
      "splits": [ ... ],
      "hasRoute": true,
      "route": { "encoding": "polyline5", "polyline": "...", "pointCount": 812 },
      "routeBounds": { "south": -6.2101, "west": 106.8012, "north": -6.1934, "east": 106.8305 },
      "routeDistanceMeters": 5187.4
    },
    "resultMetrics": {
      "version": "3",
      "kind": "running",
      "duration": { "seconds": 2100, "source": "timer", "reason": null, "meaning": "elapsed_including_rest", "verification": "client_reported" },
      "run": {
        "distanceMeters": 5200,
        "distanceSource": "gps",
        "movingSeconds": 1872,
        "paceBasis": "moving_seconds",
        "avgPaceSecondsPerKm": 360,
        "avgSpeedKmh": 10
      }
    },
    "version": "1",
    "updatedAt": "..."
  },
  "exercises": [],
  "comparison": {
    "version": "1",
    "basis": "previous_completed_workout",
    "exercises": [],
    "run": {
      "previousWorkout": { "id": "run-91ab77e0", "startedAt": "...", "finishedAt": "...", "recordedOn": "2026-11-25" },
      "distanceMeters": { "current": 5200, "previous": 5000, "delta": 200 },
      "avgPaceSecondsPerKm": { "current": 360, "previous": 360, "delta": 0 },
      "durationSeconds": { "current": 2100, "previous": 1800, "delta": 300 }
    }
  }
}
```

### Cara menampilkan

- **Pace:** `avgPaceSecondsPerKm` 360 ditampilkan sebagai `6:00 /km` (menit:detik).
  Rumusnya `waktu ÷ (jarak ÷ 1000)`. Waktu yang dipakai adalah `movingSeconds`
  untuk GPS, atau `durationSeconds` untuk past run. `paceBasis` memberi tahu
  sumber waktu yang dipakai. Saat lari berlangsung, app boleh menghitung pace
  sendiri untuk tampilan live. Setelah tersimpan, tampilkan nilai dari server.
- **Durasi:** `resultMetrics.duration.seconds` adalah waktu total termasuk pause.
  Waktu bergerak ada di `runLog.movingSeconds`.
- **Perbandingan:**
  - `comparison.run` membandingkan dengan lari terakhir sebelumnya milik akun yang
    sama, tanpa menghitung lari yang sudah dihapus.
  - Kalau belum ada lari sebelumnya, `previousWorkout`, `previous`, dan `delta`
    bernilai `null`.
  - Delta pace negatif berarti lebih cepat.

## Merekam GPS di app (current)

1. Saat Start, catat `startedAt` dan mulai location updates dengan akurasi tinggi.
   Interval 1–2 detik atau filter jarak sekitar 3–5 m.
2. Buang titik yang buruk: akurasi horizontal di atas sekitar 25 m, titik yang
   mengakibatkan lonjakan kecepatan tidak wajar (misalnya di atas 30 km/jam), dan
   titik selama pause.
3. Hitung jarak dari titik yang sudah difilter. Waktu selama pause tidak masuk
   `movingSeconds`.
4. Saat Finish, sederhanakan rute dengan Douglas-Peucker toleransi sekitar 5 m,
   lalu encode menjadi polyline presisi 1e5. Ini format Google, dan library-nya
   tersedia di Flutter/Dart, misalnya `google_polyline_algorithm` atau
   `flutter_polyline_points`. Isi `pointCount` dengan jumlah titik setelah
   disederhanakan.
5. Simpan payload dan `Idempotency-Key` di storage lokal **sebelum** dikirim.
   Kalau jaringan gagal, kirim ulang dengan key yang sama. Server tidak akan
   membuat data ganda dan akan mengembalikan respons yang sama, termasuk rute.

## Menggambar rute di workout summary

- Ambil `GET /api/v1/workouts/{id}` atau pakai respons POST, lalu decode
  `runLog.route.polyline` menjadi daftar koordinat lat/lng.
- **Di atas peta:** gambar polyline dan fit kamera ke `runLog.routeBounds`
  (south/west/north/east).
- **Tanpa peta (seperti kartu Strava):** proyeksikan koordinat ke kanvas dengan
  `routeBounds`. Pakai x = (lng − west) / (east − west) dan
  y = (north − lat) / (north − south), jaga rasio aspek, lalu gambar path-nya.
- **List history:** `GET /api/v1/workouts` sengaja **tidak** menyertakan
  `runLog.route` supaya respons tetap ringan, tetapi tetap mengirim `hasRoute`,
  `routeBounds`, jarak, dan pace. Untuk thumbnail rute, ambil detail per item.
  Filter `?mode=running` menampilkan lari saja.

## Batas dan error

Batas ini pengaman supaya server tidak menerima data yang tidak wajar. Angkanya
longgar untuk penggunaan normal.

| Field | Batas |
|---|---|
| `distanceMeters` | 1–200.000 m |
| Durasi dan `movingSeconds` | 1–43.200 detik (12 jam) |
| `route.pointCount` | 2–20.000 titik, sekitar 80–100 km setelah disederhanakan |
| `route.polyline` | Maksimal 200.000 karakter |
| `splits` | Maksimal 200 |
| Body `POST /workouts` | Maksimal 256 KB, selebihnya ditolak 413 |

Error 400 yang perlu ditangani:

- `VALIDATION_ERROR`: bentuk request salah. Contohnya `gps` tanpa `route` atau
  `movingSeconds`, `manual` yang membawa `route`, split tidak berurutan atau
  totalnya tidak cocok dengan jarak, atau ada exercise di sesi lari.
- `INVALID_SESSION_TIMING`: GPS harus memakai `timer`, past run harus memakai
  `user_reported`.
- `INCONSISTENT_RUN_DURATION`: `movingSeconds` lebih besar dari
  `finishedAt − startedAt`.
- `INVALID_ROUTE`: polyline rusak, koordinat di luar rentang, atau `pointCount`
  tidak sama dengan jumlah titik hasil decode.
- `ROUTE_DISTANCE_MISMATCH`: panjang rute hasil decode berbeda lebih dari 25%
  (+50 m) dari `distanceMeters`.

## Statistik dan histori

- `GET /statistics` menambah `totals.runningWorkouts` dan
  `totals.runningDistanceMeters`. Lari juga ikut dihitung di `completedWorkouts`
  dan durasi total.
- Dashboard dan jadwal menghitung lari sebagai workout selesai pada hari itu.
- Lari tidak memengaruhi rotasi rekomendasi program gym/calisthenics.
- `DELETE /workouts/{id}` berlaku sama seperti workout lain (soft delete dengan
  `baseVersion`).

## Kompatibilitas

- Sesi lari **tidak** muncul di sync legacy (`/sync/bootstrap`, `/sync/pull`,
  `/sync/snapshots`) dan tidak bisa dibuat lewat `/sync/push`. Ini menjaga
  client lama yang hanya mengenal gym/calisthenics/mixed.
- App versi lama yang memakai API online tetap bisa melihat `mode: "running"` di
  `GET /workouts`. Pastikan UI history mengabaikan atau menangani mode yang
  tidak dikenal.
- Workout gym dan calisthenics tidak berubah. Untuk mode selain running,
  `runLog` bernilai `null`.

## Privasi dan rencana berikutnya

Rute disimpan apa adanya dan saat ini hanya bisa dibaca pemilik akun, karena
belum ada endpoint untuk melihat histori user lain. Fitur histori publik akan
direncanakan terpisah, termasuk pengaturan visibilitas dan privacy zone
(menyembunyikan awal dan akhir rute) supaya lokasi rumah user tidak terlihat.
Data lama tidak perlu diubah untuk fitur itu.
