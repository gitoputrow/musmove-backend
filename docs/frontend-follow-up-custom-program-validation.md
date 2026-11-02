# Follow-up Frontend: Validasi Kontrak Custom Program & Penyelesaian Error 400

Pembaruan: 1 November 2026.

Dokumen ini merupakan tindak lanjut teknis atas laporan bug `400 Bad Request` (`VALIDATION_ERROR: Unknown fields are not allowed`) pada endpoint pembuatan program custom:
```http
POST /api/v1/programs/custom
```

---

## 1. Klarifikasi & Root Cause Analysis

### A. Dukungan `muscleTargets`, `trackingType`, dan `targetDurationSeconds`
Pada laporan bug, sempat dianalisis bahwa ketiga field tersebut belum terdaftar pada skema validasi backend. **Sebagai klarifikasi, ketiga field tersebut sebenarnya sudah terdaftar dan didukung penuh** pada skema `exerciseSchema` di backend:
- `trackingType`: `enum("repetitions", "duration")` (opsional, default: `"repetitions"`).
- `targetDurationSeconds`: integer `1..3600` (opsional/nullable).
- `muscleTargets`: objek `{ version: "1", primary: string[], secondary: string[] }` (opsional/nullable).

### B. Penyebab Sebenarnya dari Error `unrecognized_keys`
Skema `exerciseSchema` pada backend bersifat ketat (`.strict()`). Validasi gagal karena payload yang dikirim dari klien mobile memuat **field-field tambahan di luar kontrak resmi**, antara lain:

1. **Field `"mode"` di dalam elemen `exercisePrescriptions`**:
   - Ketika mobile mengambil latihan dari `GET /api/v1/catalog/exercises`, objek latihan katalog menyertakan `"mode": "gym"` atau `"mode": "calisthenics"`.
   - Jika objek ini langsung dimasukkan ke array `exercisePrescriptions` tanpa membuang properti `"mode"`, backend menolaknya dengan error `unrecognized_keys: ["mode"]`.
   - **Aturan**: Pada custom program, `mode` hanya boleh ada di level root program (`data.mode`). Seluruh latihan di dalam program otomatis mengikuti mode tersebut.
2. **Field per-set: `"setReps"`, `"setWeights"`, `"setDurations"`**:
   - Program latihan di backend adalah sebuah **template / resep**, bukan pencatatan riwayat sesi latihan.
   - Template program hanya menentukan target umum per latihan: `sets`, `reps` (atau `targetDurationSeconds`), dan opsi beban target `targetWeightKg`.
   - Detail per-set (`setReps`, `setWeights`, `setDurations`) hanya ada pada sesi pencatatan workout (`POST /api/v1/workouts` di dalam `setLog`), bukan pada pembuatan program.
3. **Field bawaan katalog yang belum dipetakan**:
   - Properti seperti `defaultSets`, `defaultReps`, `defaultDurationSeconds` tidak dikenali oleh skema prescription. Pastikan nilai-nilai tersebut telah dipetakan ke field yang sesuai: `sets`, `reps`, dan `targetDurationSeconds`.
4. **Penamaan Enum `trackingType`**:
   - Nilai enum resmi pada backend adalah `"repetitions"` dan `"duration"`. Nilai `"reps"` tidak valid dan akan ditolak.

---

## 2. Peningkatan Error Response pada Backend

Sebelumnya, fungsi penanganan error Zod di backend menyamarkan seluruh error `unrecognized_keys` menjadi pesan umum:
```json
{
  "errorCode": "VALIDATION_ERROR",
  "message": "The request does not match the API contract",
  "validationErrors": [
    {
      "path": "data.exercisePrescriptions.0",
      "code": "unrecognized_keys",
      "message": "Unknown fields are not allowed"
    }
  ]
}
```

Backend telah diperbarui pada [`src/lib/http.ts`](file:///Users/ni-developer/Documents/Workspace/Projects/musmove-backend/src/lib/http.ts) sehingga kini **secara eksplisit menampilkan daftar key yang ditolak**:
```json
{
  "errorCode": "VALIDATION_ERROR",
  "message": "The request does not match the API contract",
  "validationErrors": [
    {
      "path": "data.exercisePrescriptions.0",
      "code": "unrecognized_keys",
      "message": "Unknown fields are not allowed: mode, setReps"
    }
  ]
}
```
Peningkatan ini memudahkan tim front end untuk langsung mengetahui nama field yang perlu dibersihkan.

---

## 3. Spesifikasi Kontrak Resmi `exercisePrescriptions`

Setiap item di dalam array `data.exercisePrescriptions` (panjang 1–12 item) menerima field-field berikut:

| Field | Tipe | Wajib/Opsional | Keterangan |
| :--- | :--- | :--- | :--- |
| `id` | `string` | **Wajib** | ID latihan (dari katalog publik atau latihan custom milik akun). |
| `idLabel` | `string` | **Wajib** | Label nama Indonesia (1–80 karakter). |
| `enLabel` | `string` | **Wajib** | Label nama Inggris (1–80 karakter). |
| `sets` | `integer` | **Wajib** | Jumlah set (1–10). |
| `reps` | `integer` / `null` | Kondisional | Wajib integer `1..100` jika berbasis repetisi. Wajib `null` jika berbasis durasi. |
| `requirements` | `string[][]` | **Wajib** | Matriks kombinasi alat (1–20 grup kombinasi). |
| `targetWeightKg` | `number` / `null` | Opsional | Target beban tambahan dalam kg (0–500, nullable). |
| `trackingType` | `"repetitions"` \| `"duration"` | Opsional | Default `"repetitions"`. Jangan kirim `"reps"`. |
| `targetDurationSeconds`| `integer` / `null` | Kondisional | Wajib integer `1..3600` jika `trackingType: "duration"`. Wajib `null` atau diabaikan jika berbasis repetisi. |
| `muscleTargets` | `object` / `null` | Opsional | Objek anatomi target otot (lihat struktur di bawah). |

### Aturan Invarian Pengukuran (Measurement Invariants):
- **Latihan Repetisi**:
  `trackingType` bernilai `"repetitions"` (atau diabaikan), `reps` bernilai `1..100`, dan `targetDurationSeconds` bernilai `null` (atau diabaikan).
- **Latihan Durasi / Waktu (contoh: Plank)**:
  `trackingType` bernilai `"duration"`, `reps` wajib `null`, dan `targetDurationSeconds` bernilai `1..3600`.
- **Target Otot (`muscleTargets`)**:
  ```json
  "muscleTargets": {
    "version": "1",
    "primary": ["chest"],
    "secondary": ["triceps", "shoulders"]
  }
  ```
  Otot yang diizinkan: `chest`, `shoulders`, `biceps`, `triceps`, `forearms`, `abs`, `obliques`, `upperBack`, `lats`, `lowerBack`, `glutes`, `quadriceps`, `hamstrings`, `calves`.

---

## 4. Contoh Payload Request yang Valid

Berikut adalah contoh body request lengkap untuk `POST /api/v1/programs/custom` yang **100% valid dan lolos validasi**:

```http
POST /api/v1/programs/custom HTTP/1.1
Host: musmove-backend.vercel.app
Authorization: Bearer <neon-jwt>
Idempotency-Key: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Content-Type: application/json

{
  "id": "program-chest-core-v1",
  "data": {
    "mode": "gym",
    "name": "Latihan Dada & Core",
    "weekday": 1,
    "exercisePrescriptions": [
      {
        "id": "bench_press",
        "idLabel": "Bench Press",
        "enLabel": "Bench Press",
        "sets": 3,
        "reps": 10,
        "targetWeightKg": 60,
        "requirements": [["barbell", "bench"]],
        "trackingType": "repetitions",
        "targetDurationSeconds": null,
        "muscleTargets": {
          "version": "1",
          "primary": ["chest"],
          "secondary": ["triceps", "shoulders"]
        }
      },
      {
        "id": "plank",
        "idLabel": "Plank",
        "enLabel": "Plank",
        "sets": 3,
        "reps": null,
        "targetWeightKg": null,
        "requirements": [["bodyweight"]],
        "trackingType": "duration",
        "targetDurationSeconds": 60,
        "muscleTargets": {
          "version": "1",
          "primary": ["abs"],
          "secondary": ["obliques"]
        }
      }
    ]
  }
}
```

> **Catatan `durationMinutes`**: Sesuai migrasi `0028`, properti `durationMinutes` pada level program kini opsional dan **tidak perlu lagi dikirim** saat membuat atau memperbarui program.

---

## 5. Checklist Tindakan untuk Tim Front End

Sebelum mengirim request `POST /api/v1/programs/custom`, pastikan klien mobile melakukan hal-hal berikut pada serializer DTO:

1. [ ] **Hapus field `mode` dari setiap elemen `exercisePrescriptions`**. `mode` hanya boleh ada di level program (`data.mode`).
2. [ ] **Hapus field array per-set**: buang `setReps`, `setWeights`, `setDurations` jika ada di model lokal mobile.
3. [ ] **Petakan field katalog**: jika mengambil referensi dari `GET /catalog/exercises`, pastikan `defaultSets` di-map ke `sets`, `defaultReps` di-map ke `reps`, dan `defaultDurationSeconds` di-map ke `targetDurationSeconds`.
4. [ ] **Gunakan enum `trackingType` yang tepat**: gunakan `"repetitions"` atau `"duration"`, jangan gunakan `"reps"`.
5. [ ] **Pastikan pasangan reps & durasi valid**:
   - Jika latihan repetisi: `reps` bernilai angka, `targetDurationSeconds` bernilai `null` / omitted.
   - Jika latihan durasi: `reps` wajib `null`, `targetDurationSeconds` bernilai angka (`1..3600`).
6. [ ] **Hapus input estimasi menit program**: jangan lagi mewajibkan user mengisi `durationMinutes` pada form pembuatan program.
