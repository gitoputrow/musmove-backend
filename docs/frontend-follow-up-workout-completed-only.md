# Follow-up mobile: workout disimpan hanya setelah selesai

Tanggal: 20 Oktober 2026.
Status: sudah diimplementasikan pada source backend, **belum di-deploy**.
Dokumen ini menggantikan rancangan start/resume dan simpan progres workout
bertahap sebelumnya. Fitur API lain tetap mengikuti
[handoff API online](frontend-follow-up-online-api.md).

## 1. Keputusan final

**Backend hanya menerima hasil workout setelah pengguna menekan Selesai latihan.**

| Aksi pengguna | Perilaku mobile |
| --- | --- |
| Mulai latihan | Catat startedAt dan snapshot program di memori; tanpa write workout |
| Mengisi repetisi/beban atau menyelesaikan set | Perbarui setLog di memori; tanpa request simpan set |
| Membatalkan sebelum selesai | Buang progres setelah konfirmasi pengguna; tanpa menyimpan workout |
| Selesai latihan | Kirim satu POST berisi seluruh hasil akhir |
| Submit berhasil | Gunakan item kanonis dari respons untuk histori/state mobile |
| Submit gagal/timeout | Pertahankan isian dan key di memori untuk penanganan error/retry |

Tidak ada sesi aktif di backend pada alur baru, draft workout, resume server,
autosave, timer sync workout, atau outbox baru. Program/katalog tetap boleh
diambil ketika fitur memerlukannya; yang dihilangkan adalah request untuk
menyimpan progres latihan yang belum selesai.

Jika proses aplikasi berhenti sebelum submit, progres memori dapat hilang.
Jangan menjanjikan pemulihan progres setelah restart.

## 2. Satu endpoint submit akhir

```http
POST /api/v1/workouts
Authorization: Bearer <access-JWT>
Content-Type: application/json
Idempotency-Key: <UUID untuk satu submit hasil akhir>
```

Body dikirim langsung, **tanpa pembungkus data** dan tanpa baseVersion:

```json
{
  "id": "workout-uuid",
  "source": "custom",
  "programId": "program-uuid",
  "mode": "gym",
  "startedAt": "2026-10-20T07:00:00+07:00",
  "finishedAt": "2026-10-20T07:30:00+07:00",
  "recordedOn": "2026-10-20",
  "exerciseSnapshot": [
    {
      "id": "exercise-uuid",
      "idLabel": "Latihan saya",
      "enLabel": "My exercise",
      "requirements": [[]],
      "sets": 2,
      "reps": 8,
      "targetWeightKg": null
    }
  ],
  "setLog": [
    {
      "exerciseId": "exercise-uuid",
      "setNumber": 1,
      "completed": true,
      "reps": 8,
      "weightKg": 5
    },
    {
      "exerciseId": "exercise-uuid",
      "setNumber": 2,
      "completed": true,
      "reps": 7,
      "weightKg": 5
    }
  ],
  "note": "Catatan opsional"
}
```

ID di atas hanya ilustrasi. Generate ID workout baru (disarankan UUID) dan
gunakan ID program/exercise yang benar-benar tersedia untuk akun/katalog.
`id` workout berbeda fungsi dari UUID pada header Idempotency-Key; pertahankan
keduanya saat retry operasi yang sama.

| Field | Aturan |
| --- | --- |
| source | custom, recommended, atau manual |
| programId | Wajib untuk custom/recommended; **jangan dikirim** untuk manual |
| mode | gym atau calisthenics |
| startedAt / finishedAt | ISO datetime dengan timezone; finishedAt tidak boleh sebelum startedAt |
| recordedOn | Tanggal lokal mulai latihan, YYYY-MM-DD, minimal 1900-01-01; selisih maksimal satu hari dari UTC start day |
| exerciseSnapshot | Prescription yang digunakan, 1–12 exercise unik |
| setLog | Seluruh catatan hasil set, maksimum 120; kunci exerciseId/setNumber unik dan harus merujuk prescription |
| note | Opsional/null, maksimum 2.000 karakter |

Prescription `sets` adalah target jumlah set, sedangkan `setLog` adalah hasil
aktual. Set yang belum dilakukan tidak boleh ditandai selesai atau diberi hasil
repetisi/beban buatan. Field reps/weightKg pada hasil set dapat null sesuai
kontrak; null bukan angka nol. Jumlah target set/reps tidak dibentuk ulang
dari program terkini saat pengguna selesai.

Jangan kirim userId, status, version, atau field progres server.
Backend selalu menetapkan status **completed**. Body strict, maksimum 64 KiB.

## 3. Validasi dan respons

Custom program harus milik akun JWT dan memiliki mode cocok. Recommended
memerlukan ID katalog program dengan mode cocok. Source manual tidak memerlukan
program; tetap memakai endpoint yang sama.

Exercise harus dikenal di katalog atau milik akun sendiri, dengan mode cocok.
Referensi historis yang sudah nonaktif/soft-deleted tetap dapat diterima agar
perubahan selama latihan tidak membuang hasil yang sudah dilakukan. Exercise
milik akun lain/tidak dikenal ditolak. Server mengkanonisasi label/requirements,
tetapi tidak menghitung ulang prescription dari rekomendasi terbaru. Data hasil
tetap user-reported, bukan bukti program pernah direkomendasikan.

HTTP **201** mengembalikan `{ "item": { ... } }`. Item lengkap berisi:

- id, planId, mode, status completed;
- startedAt, finishedAt, recordedOn;
- exerciseSnapshot dan setLog kanonis;
- legacyMetadata.source dan note jika dikirim;
- version `"1"` serta updatedAt.

Untuk manual, planId tersimpan sebagai `manual`. Timestamp respons dapat
dinormalisasi menjadi UTC. Penyimpanan workout, event kompatibilitas sync, dan
receipt idempotensi berada dalam satu transaksi: jika gagal, tidak ada hasil
workout setengah tersimpan.

Tampilkan sukses **hanya setelah** respons berhasil. Perbarui state dari item
respons, tanpa wajib langsung GET ulang. Setelah disimpan, histori tidak bisa
diedit/reopen melalui API langsung ini. Penghapusan histori tetap soft-delete
berversi dan hanya untuk akun pemilik.

## 4. Retry dan error

- Cegah double tap Selesai saat submit berlangsung.
- Jika timeout/koneksi putus, hasil server belum tentu gagal. Selama proses masih
  hidup, retry memakai **body, id workout, dan Idempotency-Key yang sama**.
- Retry sukses mengembalikan hasil awal tanpa menambah row/versi/histori lagi.
- Jangan otomatis membuat ID/key baru saat hasil submit sebelumnya belum pasti.
- 400: perbaiki input; ID workout lama yang dipakai ulang juga dapat menghasilkan
  RESOURCE_ID_REUSE. Key/body yang sudah sukses tidak boleh diubah untuk aksi baru.
- 401: ikuti refresh JWT terbatas. 403 inactive: jangan loop refresh.
- 404 PROGRAM_NOT_AVAILABLE: program tidak cocok/tidak tersedia untuk akun/mode.
- 409 IDEMPOTENCY_KEY_REUSE: key sudah dipakai untuk isi/aksi berbeda.
- 429: hormati Retry-After. 500/503: tampilkan error aman dan pertahankan isian.
- Setelah restart, baca histori melalui alur normal. Tidak ada endpoint discovery
  operasi atau jaminan recovery form/key lintas restart.

## 5. Endpoint lama yang tidak dipakai mobile baru

Route berikut dihapus dari source API langsung yang sebelumnya disiapkan:

- GET /workouts/active;
- POST /workouts/manual;
- PATCH /workouts/{id}/sets;
- POST /workouts/{id}/complete;
- POST /workouts/{id}/abort.

Dashboard tidak lagi menyediakan activeWorkout. Read histori/detail tetap:

```http
GET /api/v1/workouts?from=2026-10-01&to=2026-10-31&limit=25
GET /api/v1/workouts/{id}
```

Jangan mengirim ulang hasil POST /workouts melalui /sync/push. Sync lama, row
active/aborted legacy, tombstone dan receipt **tidak dihapus**; penyesuaian ini
hanya mengubah alur API langsung untuk mobile baru. Read/rekap lama masih bisa
memuat status legacy, bukan berarti start/resume baru tersedia. Storage/outbox
lama pada perangkat tetap tidak boleh dibuang otomatis tanpa rencana transisi.

## 6. Checklist frontend dan rollout

- Hapus ketergantungan start/resume/simpan set/abort ke backend pada alur baru.
- Simpan prescription dan hasil aktual di memori selama latihan.
- Submit satu payload final; gunakan hasil kanonis setelah ACK.
- Uji batal tanpa write, input invalid tanpa histori baru, retry tanpa duplikasi,
  ownership, serta perubahan program yang tidak mengubah hasil latihan tersimpan.
- Kontrak lengkap: [OpenAPI utama](openapi.yaml) dan
  [schema CompletedWorkoutInput](openapi-online.json#/components/schemas/CompletedWorkoutInput).
- Source sudah diuji dengan database dan identitas sintetis; bukan uji write
  akun production. Perlu redeploy Vercel dan uji integrasi yang disetujui sebelum
  mobile mengandalkan kontrak baru. Capability operasionalnya adalah
  completedWorkoutSubmission; jangan menambah GET /meta rutin pada startup.
- Dokumen ini tidak mengubah atau membangun project Flutter.
