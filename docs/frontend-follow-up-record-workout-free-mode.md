# Follow-up frontend: Record Workout bebas mode profil

Pembaruan26 Oktober2026: [hasil workout dan durasi per set](frontend-follow-up-workout-result-metrics.md)
memperluas pengukuran repetitions/duration untuk kedua mode. Angka119 katalog,
nullable reps, resultMetrics dan statistik nullable memerlukan0024; belum
diterapkan/deploy. Status0023 pada dokumen ini adalah rollout sebelumnya.

Tanggal: 23 Oktober 2026. Menindaklanjuti `backend-record-workout-free-mode-follow-up.md`.

Perubahan **hanya manual**. Profil, equipment, rekomendasi, Custom Program dan
workout dari program tetap memakai gym/calisthenics seperti sebelumnya. Backend
tidak membuat UI mobile. Status source, migrasi dan deployment dipisahkan di akhir.

## 1. Memilih exercise tanpa mode profil

- `GET /api/v1/catalog/exercises` tanpa mode sudah mengembalikan kedua mode.
  Source serta pemeriksaan API publik menunjukkan 117 exercise aktif.
- `GET /api/v1/exercises/custom?limit=100` tanpa mode mengembalikan gerakan akun
  dari kedua mode. Ikuti `nextCursor` sampai null untuk seluruh daftar; halaman
  default 25, maksimum 100. Cursor terikat akun dan filter. Jika filter berubah,
  mulai ulang tanpa cursor. Pengguna lain/tombstone tidak masuk daftar ini.
- Hilangkan filter `forMode(profileMode)` **hanya pada Record Workout**.
  Custom Program tetap memakai mode dan filter lama.
- Identitas katalog adalah **(mode, id)**. Saat diperiksa, `squat`, `lunge`,
  `chair_sit_to_stand`, `dead_bug`, `supported_reverse_lunge` ada pada kedua mode.
  Jangan deduplikasi/menyamakan gerakan berdasarkan ID atau nama saja.
- Gerakan milik akun tetap punya klasifikasi mode gym/calisthenics yang eksplisit.
  Untuk gerakan baru, minta klasifikasi per gerakan; jangan menebaknya dari nama,
  alat, atau mode profil. Tidak ada klasifikasi AI atau kategori ketiga untuk exercise.

Tidak perlu request baru setiap memilih exercise. Pemilihan satu item dapat
langsung menambah kartu dan menutup sheet sesuai rancangan mobile. Default kartu
baru **1 set**; tambah set sesuai input pengguna, bukan default katalog/program.
Batas 12 exercise tetap berlaku walaupun indikator 0/12 tidak ditampilkan.

## 2. Request final manual lintas mode

```http
POST /api/v1/workouts
Authorization: Bearer <access JWT>
Content-Type: application/json
Idempotency-Key: <UUID untuk satu submit final>
```

Jangan kirim top-level `mode`, `programId`, `userId`, status atau version.
Kirim **mode pada setiap exerciseSnapshot** dan **exerciseMode pada setiap setLog**.
Keduanya memakai gym/calisthenics. Top-level `mixed` tidak pernah dikirim client.
Contoh valid, satu sesi bench press dan pull-up dengan hasil berbeda per set:

```json
{
  "id": "workout-7317657c-96b8-4bb3-bec0-c6a3223ac6c3",
  "source": "manual",
  "startedAt": "2026-10-23T07:00:00+07:00",
  "finishedAt": "2026-10-23T07:30:00+07:00",
  "recordedOn": "2026-10-23",
  "exerciseSnapshot": [
    {
      "id": "bench_press", "mode": "gym",
      "idLabel": "Bench press barbel", "enLabel": "Barbell bench press",
      "requirements": [["barbell", "bench"]],
      "sets": 2, "reps": 10, "targetWeightKg": null
    },
    {
      "id": "pullup", "mode": "calisthenics",
      "idLabel": "Pull-up", "enLabel": "Pull-up",
      "requirements": [["pull_up_bar"]],
      "sets": 2, "reps": 8, "targetWeightKg": null
    }
  ],
  "setLog": [
    { "exerciseId": "bench_press", "exerciseMode": "gym", "setNumber": 1, "completed": true, "reps": 10, "weightKg": 40 },
    { "exerciseId": "bench_press", "exerciseMode": "gym", "setNumber": 2, "completed": true, "reps": 8, "weightKg": 45 },
    { "exerciseId": "pullup", "exerciseMode": "calisthenics", "setNumber": 1, "completed": true, "reps": 8, "weightKg": 0 },
    { "exerciseId": "pullup", "exerciseMode": "calisthenics", "setNumber": 2, "completed": true, "reps": 6, "weightKg": 0 }
  ],
  "note": "Latihan bebas"
}
```

Angka di atas contoh pelaporan, bukan anjuran beban/repetisi. `reps` snapshot
adalah target; hasil aktual tetap milik tiap entri setLog. Nilai null bukan nol.
Backend tidak menyamakan reps/beban antar set atau menimpa dengan default.

Server memverifikasi referensi dan menentukan mode sesi dari snapshot kanonis:

| Mode exercise | Mode sesi pada respons/storage |
| --- | --- |
| Semuanya gym | gym |
| Semuanya calisthenics | calisthenics |
| Kedua mode | mixed |

Source tidak membaca mode profil untuk menentukan ini dan tidak membutuhkan
profil/onboarding sudah selesai; auth dan guard akun aktif tetap wajib.

Respons HTTP201 tetap `{ "item": { ... }, "exercises": [] }` untuk contoh di atas.
`item` memuat id, version `"1"`, updatedAt, planId `"manual"`, mode `"mixed"`,
status `"completed"`, startedAt/finishedAt dalam UTC, recordedOn, exerciseSnapshot
kanonis dengan mode per exercise, setLog persis hasil yang dikirim, serta
legacyMetadata `{ "source": "manual", "note": "Latihan bebas" }`.
`exercises` hanya gerakan baru yang dibuat pada submit, bukan seluruh snapshot.

## 3. Gerakan baru: satu transaksi, tanpa request pendahuluan

Tambahkan gerakan baru dalam `exerciseSnapshot` dengan ID stabil buatan client
dan mode eksplisit, lalu deklarasikan ID/mode yang sama dalam newExercises:

```json
{
  "newExercises": [
    {
      "id": "user-exercise-d5d5ac40-241f-4554-a023-b2f0d7ec0cb0",
      "data": {
        "name": "Gerakan saya", "mode": "calisthenics",
        "defaultSets": 1, "defaultReps": 8
      }
    }
  ]
}
```

Ini potongan tambahan, bukan body POST lengkap. Snapshot gerakan tersebut juga
wajib dikirim; setLog jika ada memakai exerciseId dan exerciseMode yang sama.
Gerakan lama cukup direferensikan, jangan dideklarasikan sebagai newExercises.

Maksimum 12 ID gerakan baru unik, semuanya dipakai snapshot dengan mode cocok.
Nama/default divalidasi seperti API exercise lama. Mode gerakan milik akun
tidak bisa diubah setelah dibuat; ID unik per akun, bukan per mode. ID katalog
tidak boleh dipakai untuk gerakan baru. ID sama di akun lain tidak dibaca atau
ditimpa: hanya deklarasi newExercises baru milik akun sendiri yang bisa membuatnya.

Workout, gerakan baru, event sync, versi dan satu receipt commit atomik. Salah
satu gagal → semuanya rollback. Label/requirements dari server; untuk gerakan
akun, label mengikuti nama tersimpan dan requirements `[[]]`, bukan bukti alat.
Snapshot sets/reps tidak diganti dengan defaultSets/defaultReps.

## 4. Referensi, batas dan retry

- Snapshot 1–12 item; pasangan **(mode,id)** harus unik. `squat/gym` dan
  `squat/calisthenics` boleh hadir bersama dan tetap dua exercise berbeda.
- SetLog maksimal 120; **(exerciseMode,exerciseId,setNumber)** unik, merujuk
  snapshot yang sama; setNumber tidak boleh melebihi sets snapshot. Sets 1–10,
  target reps 1–100, actual reps 0–100 atau null, beban 0–500 kg atau null.
  Array setLog kosong tetap diterima seperti sebelumnya; bukan bukti semua set selesai.
- Semua item/log harus memakai format eksplisit secara konsisten. Jangan kirim
  setLog tanpa exerciseMode pada format baru, bahkan ketika ID kebetulan unik.
- exerciseMode bukan pilihan bebas: harus sesuai referensi katalog/gerakan akun.
  Referensi historis katalog nonaktif/gerakan sendiri soft-deleted tetap diterima
  agar perubahan selama latihan tidak membuang hasil. Daftar pemilih hanya aktif.
- JSON maksimum64 KiB/depth32, waktu selesai >= mulai, recordedOn >=1900-01-01
  dan maksimal selisih1 hari dari UTC start day; batas/cara lama tetap berlaku.
- Tidak ada start/resume/autosave/per-set API. Simpan hanya saat selesai.
- Saat hasil submit belum pasti: pertahankan body, ID workout, ID gerakan baru
  dan Idempotency-Key **yang sama** untuk retry; jangan pindah format atau
  membangkitkan ID/key baru. Sukses memakai respons kanonis tanpa GET tambahan.
- Receipt lama tetap direplay persis, termasuk yang hanya punya item. Field
  exercises yang tidak ada pada replay lama dapat diperlakukan sebagai array kosong.

Error relevan:

| Status/code | Arti/tindakan |
| --- | --- |
| 400 VALIDATION_ERROR | Format campur, mode hilang/tidak valid, referensi/nomor set/duplikasi tidak valid; perbaiki input |
| 400 EXERCISE_NOT_AVAILABLE | Referensi ID+mode tidak ada pada katalog/akun sendiri |
| 400 AMBIGUOUS_EXERCISE_REFERENCE | Data gerakan akun lama menimpa ID katalog pada mode sama; jangan memilih diam-diam. Pilih ID lain/daftarkan ID baru untuk gerakan akun |
| 400 RESOURCE_ID_REUSE | ID workout pernah dipakai; jangan otomatis membuat ID baru jika hasil submit sebelumnya belum pasti |
| 409 RESOURCE_ID_REUSE | newExercises berbenturan ID milik sendiri/tombstone/katalog |
| 409 IDEMPOTENCY_KEY_REUSE | Key sukses dipakai dengan body berbeda; retry hasil belum pasti harus identik |
| 401/403 | Sesi tidak sah/akun tidak aktif; ikuti alur auth/lifecycle lama |

Jika katalog dan gerakan akun lama memiliki ID+mode sama, format baru menolak
ambiguitas daripada menebak. Row akun lain tidak pernah menyebabkan ambiguitas
atau dapat menjadi referensi privat. API baru sudah mencegah pembuatan shadow ID.

## 5. Histori, filter, ringkasan dan kompatibilitas

- GET /workouts dan GET /workouts/{id} mempertahankan mode/snapshot/log tersimpan.
  Data lama tidak ditambah mode per exercise atau dihitung ulang. Perubahan
  nama/default exercise atau preferensi tidak mengubah histori.
- GET /workouts tanpa mode mencakup semua. Filter opsional `mode=gym`,
  `mode=calisthenics`, `mode=mixed` adalah **klasifikasi sesi persis**; gym/cali
  tidak memasukkan sesi mixed. Jangan memalsukan mixed menjadi mode profil.
  Pagination tetap offset cursor lama; jaga from/to/mode tetap sama antar halaman,
  mulai tanpa cursor jika filter berubah. Bukan snapshot konsisten saat ada insert.
- Kalender/dashboard/statistik tidak memakai filter mode; setiap workout mixed
  dihitung sekali, durasi sekali, set/reps/beban dari tiap log seperti sebelumnya.
- Histori mixed tidak digunakan sebagai evidence beban dalam rekomendasi saat ini:
  query rekomendasi tetap mengambil histori dengan mode sesi persis. Manual tidak
  memberi kredit rotasi program recommended. Tidak ada perubahan rekomendasi.
- Sync/bootstrap/snapshot baca meneruskan representasi baru secara lossless untuk
  pembaca yang sudah diperbarui. Legacy sync/push dan demo import **tidak boleh
  membuat format eksplisit baru**; gunakan POST /workouts agar canonicalization
  dan ownership tidak terlewati. Payload sync lama tetap didukung.
- Format manual lama (top-level mode, tanpa mode per snapshot/log) tetap diterima.
  Jangan gabungkan kedua format. Custom/recommended tetap memakai format lama
  dengan programId dan satu mode yang cocok; newExercises tetap manual-only.

**Penting:** menerima request lama bukan berarti klien lama bisa membaca `mixed`.
Parser enum workout, mapping snapshot/log dan kunci koleksi mobile harus diperbarui
sebelum ada sesi campuran. Jangan rollback ke parser dua nilai setelah mixed
tersimpan. Tidak ada transformasi diam-diam atau penghilangan histori untuk
menyembunyikan mixed. Koordinasikan pembaruan seluruh pembaca yang masih didukung.

## 6. Migrasi, rollout dan hasil tes

Migrasi `0023_manual_mixed_workouts` membuat enum **workout_mode** dan mengubah
tipe kolom workout_sessions.mode dengan mapping nilai lama yang identik. Enum
training_mode tetap dua nilai; tidak ada tabel/kolom baru. Constraint SQL membatasi
mixed pada completed manual. Tidak menghapus/mengedit isi snapshot, profil,
receipt, status, tanggal, versi atau timestamp. ALTER TYPE kolom memerlukan lock
dan dapat menulis ulang tabel; gunakan lock/statement timeout dan waktu deploy
yang sesuai ukuran data. Jangan menjalankan sebagai role runtime API.

Urutan: verifikasi/pasang0023 → deploy backend → perbarui/verifikasi pembaca
mobile → baru kirim format manual baru. Capability source
`manualWorkoutFreeMode:true` dicek operasional saat rollout, bukan request startup.
Capability bukan bukti migrasi sudah diterapkan atau seluruh klien telah siap.

Tes lokal in-memory mencakup preservasi migrasi, kedua format, ID lintas mode,
referensi akun asing/ambigu, newExercises lintas mode atomik beserta kegagalan DB,
retry identik/key berbeda payload, pagination gerakan akun, list/filter/detail,
kalender/dashboard/statistik, sync baca/tolak bypass write, role runtime terbatas,
dan Custom Program/program-workout tetap menolak mode salah.

Status aktual 23 Oktober 2026:

- **Source selesai**, capability manualWorkoutFreeMode tersedia pada source.
- **Migrasi0023 berhasil diterapkan** ke database Neon yang dikonfigurasi project,
  setelah target runtime/admin dan histori migrasi cocok. Total24 migrasi,
  tidak ada pending/unknown pada pemeriksaan. Workout memakai workout_mode;
  runtime tetap memiliki akses baca dan USAGE tipe baru.
- Fingerprint server-side sebelum/sesudah untuk workout_sessions, profiles,
  training_preferences dan operation_receipts cocok. Isi histori/profil/
  preferensi/receipt tidak berubah. Tidak ada workout/gerakan uji baru ditulis
  pada database tersebut; uji mutasi menggunakan PGlite dan identitas sintetis.
- **37 tes online/kontrak/migrasi**,25 tes program,12 follow-up,11 onboarding,
  16 auth dan10 security lolos. Schema smoke, lint, typecheck, pemeriksaan
  referensi OpenAPI dan pattern secret scan lolos. Ini bukan pengujian Flutter,
  APK, login/JWT akun nyata, atau final-submit produksi.
- **Belum push/deploy backend maupun mengubah Flutter**. Pemeriksaan metadata
  deployment saat pekerjaan ini masih belum mengiklankan manualWorkoutFreeMode.
  Migrasi berhasil tidak berarti endpoint produksi sudah menerima format baru.
- Build production Node24 berhasil pada percobaan ulang setelah reminder
  keamanan Next.js. **npm audit --omit=dev masih menandai1 dependency critical**
  (Next.js16.4.0, patch tersedia16.4.2). Ini temuan terpisah yang belum diubah;
  build sukses bukan bukti zero vulnerabilities. Prioritaskan upgrade keamanan
  dan regresi sebelum redeploy. Detail advisory juga dicatat pada
  [follow-up rekomendasi sebelumnya](backend-workout-recommendations-follow-up.md).
