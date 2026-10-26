# Follow-up frontend: hasil workout, waktu tahan, kalori dan otot

Tanggal: 26 Oktober 2026. Mengikuti `backend-workout-result-metrics-request.md`.
Source backend selesai; **bukan klaim deployment**. Migrasi0024 belum dijalankan
oleh pekerjaan ini. Persiapan parser nullable/duration diperlukan sebelum rollout.
Perubahan manual bebas mode sebelumnya tetap berlaku.

## 1. Jenis pengukuran

`trackingType`: `repetitions` atau `duration`. Omission pada payload lama berarti
format repetisi lama, bukan tebakan dari nama/mode. Target berbeda dari hasil:

| Jenis | Target prescription/snapshot | Hasil setLog |
| --- | --- | --- |
| repetitions | reps integer1–100; targetDurationSeconds omit/null | reps0–100 atau null; durationSeconds omit/null |
| duration | trackingType duration, reps **null**, targetDurationSeconds integer1–3600 | reps **null**, durationSeconds integer1–3600 atau null/omit |

Sets tetap1–10; maksimum12 exercise/120 log. Beban0–500 kg atau null, tiap set
bisa berbeda. Nol beban/repetisi tetap nol; nol waktu tahan tidak valid (400).
Waktu belum diketahui →null/omit, bukan0. `completed:true` boleh mempunyai hasil
unknown; status tersebut bukan bukti semua target telah dilakukan. Log tidak
completed tidak diikutkan ringkasan. Set berbasis waktu tidak dihitung sebagai
repetisi dan tidak dikalikan kg. Beban pada hold boleh dicatat, tetapi tidak
dikonversi menjadi volume repetisi/bodyweight atau tingkat kesulitan.

Jenis harus cocok dengan referensi exercise kanonis; tidak cocok →400
TRACKING_TYPE_MISMATCH. Omission trackingType tidak dapat dipakai untuk membuat
gerakan duration seolah-olah repetitions. Client tidak perlu mengirim reps palsu.

Katalog baru menyediakan trackingType, defaultDurationSeconds, muscleTargets,
dan defaultReps yang **nullable**. Migrasi0024 mempertahankan117 gerakan lama
sebagai repetitions dan menambah `plank` pada gym/calisthenics:119 total.
Kedua plank adalah duration, defaultSets1/defaultRepsnull/defaultDurationSeconds30.
30 detik adalah target katalog yang bisa dipilih, bukan hasil atau resep medis.

Gerakan buatan: sertakan trackingType duration, defaultRepsnull dan
defaultDurationSeconds1–3600; defaultSets1–10 tetap. Gerakan buatan repetisi lama
tetap valid tanpa field baru. Mode dan trackingType immutable setelah dibuat;
ingin mengubah jenis →buat ID baru. Mengedit default/nama tidak mengubah histori.
Pemetaan otot gerakan buatan belum diverifikasi dan tetap unknown/null.

Program custom tetap gym/calisthenics tunggal, tetapi dapat menggabungkan
prescription repetisi/waktu pada mode yang sama, termasuk newExercises atomik.
Jadwal mingguan tetap boleh berisi program kedua mode. Rekomendasi juga mendukung
prescription waktu bila template dikonfigurasi;41 template lama tidak diganti
otomatis oleh migration ini. Target hold konservatif dibatasi20 detik tanpa
assessment waktu, atau80% assessment durasi; tidak melebihi target template.
Kembali latihan/tired maksimal10 detik; semua guard alat/konteks tetap berlaku.
Ini batas produk, bukan jaminan kemampuan/keamanan individual. Tidak ada konversi
assessment reps atau histori reps ke detik, maupun progresi beban/waktu otomatis.

Assessment waktu opsional pada profil: `{exerciseId, mode, trackingType:
"duration", maxReps:null, maxDurationSeconds:0..3600, weightKg, bodyweightKg?}`.
Nol kapasitas memblokir exercise; assessment reps lama tetap maxReps0–100,
tanpa maxDurationSeconds. Jenis pengukuran tidak ditentukan dari gym/kalistenik.

## 2. Durasi seluruh sesi dan provenance

POST /workouts menerima `sessionTiming` opsional:

- `{ "source": "timer" }`: hitung selisih startedAt/finishedAt, floor ke detik.
  Jangan kirim durationSeconds dalam object ini. Hasil wajib1–43200 detik.
  Ini timer yang dilaporkan client, bukan pengukuran yang diverifikasi server.
- `{ "source": "user_reported", "durationSeconds": 1800 }`: durasi manual
  eksplisit1–43200 detik; **manual-only**. Bukan selisih placeholder tanggal.
- Omit sessionTiming →durasi unknown, termasuk bila selisih timestamp terlihat
  masuk akal. Ini menjaga data manual lama yang memakai placeholder.

Program custom/recommended hanya boleh menggunakan timer jika timing dikirim.
Manual dapat memakai salah satu. Aturan timestamp/date lama tetap: finishedAt
tidak mendahului startedAt, recordedOn lokal mulai latihan dan >=1900-01-01.
Timer nonpositif/tidak memenuhi batas →400 INVALID_SESSION_TIMING. Jumlah hold
completed yang diketahui tidak boleh melebihi durasi sesi eksplisit →400
INCONSISTENT_WORKOUT_DURATION. Tanpa durasi sesi, jumlah hold **tidak mengisinya**.
Durasi ini elapsed termasuk istirahat/transisi, bukan moving time.

## 3. Contoh submit campuran repetisi/waktu

Tetap satu POST /api/v1/workouts dengan Bearer JWT dan Idempotency-Key UUID.
Tidak ada request per set, endpoint preview, polling, atau request tambahan
untuk mengambil hasil. Body contoh berikut manual bebas mode; untuk program,
tambahkan programId/mode sesi dan hilangkan mode per exercise/exerciseMode per log.

```json
{
  "id": "workout-a3a56865-5722-4b05-a190-ea92dd693a5d",
  "source": "manual",
  "startedAt": "2026-10-26T07:00:00+07:00",
  "finishedAt": "2026-10-26T07:30:00+07:00",
  "recordedOn": "2026-10-26",
  "sessionTiming": { "source": "user_reported", "durationSeconds": 1800 },
  "energyActivityCode": "02035",
  "workoutBodyweightKg": 70,
  "exerciseSnapshot": [
    { "id": "bench_press", "mode": "gym", "idLabel": "Bench press barbel", "enLabel": "Barbell bench press", "requirements": [["barbell", "bench"]], "sets": 2, "reps": 10, "targetWeightKg": null, "trackingType": "repetitions" },
    { "id": "plank", "mode": "calisthenics", "idLabel": "Plank lengan bawah", "enLabel": "Forearm plank", "requirements": [[]], "sets": 2, "reps": null, "targetWeightKg": null, "trackingType": "duration", "targetDurationSeconds": 30 }
  ],
  "setLog": [
    { "exerciseId": "bench_press", "exerciseMode": "gym", "setNumber": 1, "completed": true, "reps": 10, "weightKg": 40 },
    { "exerciseId": "bench_press", "exerciseMode": "gym", "setNumber": 2, "completed": true, "reps": 8, "weightKg": 45 },
    { "exerciseId": "plank", "exerciseMode": "calisthenics", "setNumber": 1, "completed": true, "reps": null, "weightKg": 0, "durationSeconds": 30 },
    { "exerciseId": "plank", "exerciseMode": "calisthenics", "setNumber": 2, "completed": true, "reps": null, "weightKg": null, "durationSeconds": 45 }
  ]
}
```

Nilai hanya contoh pelaporan, bukan anjuran latihan. Activity code harus benar-benar
dipilih sesuai jenis sesi; jangan hardcode02035 untuk semua sesi/mixed.

Respons201 tetap `{item,exercises}`. Item memuat snapshot/log kanonis beserta
`resultMetrics` yang disimpan, termasuk durasi, energi, dan cakupan otot.
Gunakan item dari ACK ini atau GET histori untuk hasil tersimpan. Jika preview
dibuka sebelum submit/ACK, kalori backend belum tersedia dan tetap `—`; jangan
membuat request estimasi terpisah atau rumus fallback. Retry submit yang hasilnya
belum pasti tetap mengikuti key/body sama, bukan dianggap selesai tanpa ACK.
Potongan hasil contoh, dengan asumsi profil ageYears25 dan input valid:

```json
{
  "version": "1",
  "duration": { "seconds": 1800, "source": "user_reported", "reason": null, "meaning": "elapsed_including_rest", "verification": "client_reported" },
  "energy": { "kcal": 183.8, "reason": null, "method": "standard_met_gross_v1", "kind": "gross_including_resting_energy", "activityCode": "02035", "met": 5, "durationSeconds": 1800, "bodyweightKg": 70, "bodyweightSource": "workout_user_reported", "ageYears": 25, "categorySource": "user_reported", "reference": "2024 Adult Compendium (ages 19–59)", "referenceUrl": "https://pacompendium.com/conditioning-exercise/", "estimated": true },
  "muscles": { "coverage": "complete", "primary": ["abs", "chest"], "secondary": ["lowerBack", "obliques", "shoulders", "triceps"], "completedExerciseCount": 2, "unknownExercises": [], "mappingVersion": "1" }
}
```

Contoh log tetap dua reps berbeda dan dua waktu tahan berbeda setelah roundtrip.
Ringkasan mobile:4 completed set;18 repetisi;760 kg volume eksternal repetisi;
75 detik hold;30 menit elapsed. Cakupan metrik berbeda, jangan dijumlahkan silang.

## 4. Estimasi energi: metode, input dan batas

`kcal = MET × 3.5 × bodyweightKg ÷ 200 × menit sesi`, dibulatkan1 desimal.
Ini **gross estimate**, termasuk energi istirahat metabolik, bukan active/net
calories atau hasil pengukuran sensor. Jangan tampilkan sebagai angka pasti atau
otomatis menambahkan/menguranginya dari target nutrisi/budget makanan.

Pilihan activity code pada POST (kategori seluruh sesi, dilaporkan user):

| Code | Label ringkas mobile | MET |
| --- | --- | --- |
| 02054 | Resistance, beberapa gerakan8–15 reps | 3.5 |
| 02050 | Weight lifting, vigorous | 6 |
| 02024 | Calisthenics, light | 2.8 |
| 02022 | Calisthenics, moderate | 3.8 |
| 02020 | Calisthenics, vigorous | 7.5 |
| 02056 | Bodyweight resistance, general | 3 |
| 02057 | Bodyweight resistance, high intensity | 6.5 |
| 02035 | Circuit, moderate | 5 |

Backend tidak menerima angka MET/kcal dari client. Mode, goal, gender, nama
gerakan, kg volume dan total hold tidak digunakan untuk menebak kategori atau
intensitas. Elapsed dengan istirahat panjang dapat membuat estimasi kategori
kurang representatif; belum ada segmentasi intensitas/rest atau estimasi tiap set.

Untuk v1, usia profil19–59 dan durasi energi maksimal3 jam, berat1–500 kg.
Ini batas penerapan produk/reference, bukan batas kemampuan manusia. Bila ada
workoutBodyweightKg, itu berat saat workout yang dilaporkan user. Tanpanya,
berat profil saat submit hanya dipakai jika finishedAt dalam24 jam dari server.
Catatan lebih lama perlu berat workout eksplisit; jangan memakai berat profil
sekarang seolah-olah berat historis. Age/source/input disimpan bersama hasil.

kcal null dengan reason: DURATION_UNKNOWN, ACTIVITY_REQUIRED, AGE_REQUIRED,
AGE_OUTSIDE_REFERENCE, BODYWEIGHT_REQUIRED, WORKOUT_BODYWEIGHT_REQUIRED,
BODYWEIGHT_OUT_OF_SCOPE, DURATION_OUT_OF_SCOPE, NO_COMPLETED_SETS, atau
FUTURE_WORKOUT. Reason dipilih berurutan sesuai input yang belum memenuhi aturan.
Durasi dan activity code yang valid tetap bisa tersimpan saat energi null.
Tampilkan `—` + alasan singkat; jangan membuat formula fallback di mobile.

Sumber: [kategori/MET Compendium2024](https://pacompendium.com/conditioning-exercise/),
[cakupan usia19–59](https://pacompendium.com/adult-compendium/),
[batas ketepatan MET individual](https://pacompendium.com/corrected-mets/), dan
[rumus energi ACE](https://www.acefitness.org/resources/pros/expert-articles/6434/5-things-to-know-about-metabolic-equivalents/).

## 5. Diagram otot: snapshot kanonis dan unknown

Kosakata14 area mengikuti usulan mobile: chest, shoulders, biceps, triceps,
forearms, abs, obliques, upperBack, lats, lowerBack, glutes, quadriceps, hamstrings,
calves. Katalog memakai `muscleTargets:{version:"1",primary:[],secondary:[]}`,
primary nonkosong dan tidak ada area duplikat/beririsan. Unknown adalah null,
bukan full body. Semua119 entri seed baru memiliki mapping eksplisit di0024;
gerakan user belum diverifikasi dan tetap null. Nama/alias, movementTags,
preferensi profil dan program focus tidak dijadikan pemetaan otot.

Pemetaan ini **taksonomi target buatan produk**, bukan pengukuran aktivasi,
persentase kontribusi atau klaim medis. Kelompok otot kecil di luar kosakata
visual tidak diwakili. Pengelompokan varian sejenis tidak menyatakan kontribusi
otot sama pada semua teknik/individu. Dasar gerakan/taksonomi:
[ACE exercise library](https://www.acefitness.org/resources/everyone/exercise-library/),
[ACE front plank](https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/),
[NASM bench press](https://www.nasm.org/resource-center/exercise-library/barbell-bench-press),
[NASM pull-up](https://www.nasm.org/resource-center/exercise-library/pull-up).

Saat submit, backend mengganti muscleTargets client dengan mapping katalog
atau null untuk gerakan akun. Snapshot disimpan bersama workout; GET/list
tidak membaca katalog terbaru untuk membentuk ulang histori. Summary muscles
di resultMetrics hanya memasukkan referensi dengan set completed:

- complete: semua exercise completed mempunyai mapping, **bukan semua otot tubuh
  terlatih** atau semua otot fisiologis pada gerakan sudah terdaftar.
- partial: hanya sebagian mempunyai mapping; area diketahui tetap bisa merah,
  tetapi tampilkan indikator cakupan parsial dan unknownExercises.
- unknown: tidak ada exercise completed atau semua belum terpetakan. Diagram netral.

Preview awal boleh memakai merah sama untuk primary/secondary. Jangan mewarnai
gerakan yang baru dipilih tetapi belum mempunyai set completed.

## 6. Histori, statistik, retry dan rollout

Tidak ada endpoint baru. Volume/set/reps/hold dapat dihitung mobile dari snapshot
dan log yang tersedia; ini bukan permintaan agregat volume tambahan pada POST.
Identitas manual tetap(mode,id) dan mode-qualified setNumber. Program tetapsatu mode.
Target bukan hasil: absent log tidak berarti target dilakukan; actual null bukan0.
Volume hanya perkalian actual reps × actual external weight pada repetition sets
completed yang referensinya cocok. Tanpa hasil lengkap untuk cakupan tersebut,
total bukan angka parsial; tampilkan unknown. Jangan tambahkan berat badan atau
mengurangi bantuan band/mesin sebagai beban positif.

Statistik existing diperbaiki: reportedReps/reportedExternalVolumeKg/
totalHoldSeconds nullable jika hasil pada cakupannya tidak lengkap. Counter
repetitionSets/durationSets, setsMissingReps/Load/Duration dan
unmatchedCompletedSets menjelaskan cakupan. Log completed tanpa referensi snapshot
tidak dihitung; keberadaannya membuat total konservatif unknown.
durationMinutes pada hari/totals nullable bila ada sesi completed tanpa timing;
knownDurationMinutes adalah subtotal yang **berlabel jelas**, bukan total lengkap.
workoutsMissingDuration menghitung yang belum diketahui. Jangan menjumlahkan
durationMinutes null sebagai0. Semua mode tetap dihitung satu sesi, bukan dua.

ResultMetrics lama null/absent tetap unknown. Migrasi tidak mengisi elapsed,
kalori, anatomi, jenis baru, atau waktu per set pada JSON histori lama. Receipt
lama direplay persis, termasuk bila belum ada resultMetrics/exercises. Setelah
sukses commit, snapshot, log, metode, input dan hasil tidak berubah oleh profil,
katalog/program, atau pembaruan rumus. Timeout hasil belum pasti →retry **body,
workout ID dan key sama**, bukan GET preview atau key baru. Validasi/DB gagal
rollback exercise baru, workout, metrics, stream dan receipt sekaligus.

Sync baca/bootstrap/snapshot meneruskan field baru untuk pembaca yang siap.
Legacy sync/demo tidak menerima resultMetrics, anatomy atau log waktu baru;
gunakan API final submit yang melakukan canonicalization. Jangan mengirim
resultMetrics dalam POST (400); field itu server-owned.

Migrasi0024 menambah metadata katalog/user exercise, target waktu program dan
result_metrics JSONB nullable; default_reps/reps pada kolom terkait menjadi
nullable. Isi JSON histori/profil/receipt tidak ditulis ulang. Perlu maintenance/
lock timeout sesuai ukuran tabel, admin migration credentials, dan review grants.
Tidak ada env/dependency baru. Capability source `workoutResultMetrics:true`
hanya penanda source, bukan bukti migrasi/deployment. Jangan menambah /meta startup.

**Urutan:** siapkan parser/UI nullable/type/time/new stats → koordinasikan
migrasi0024 dan deploy backend dalam rollout terkontrol → baru aktifkan input
baru. Nullable defaultReps katalog baru dan nullable statistik mematahkan asumsi
parser lama; jangan jalankan seed/deploy sepihak saat pembaca lama masih dipakai.
Sesudah time-based data tersimpan, rollback ke validator reps-only tidak aman.

Status pekerjaan: source/kontrak dan tes lokal selesai; **migrasi0024 belum
dijalankan pada Neon, belum push/deploy Vercel, tidak mengubah Flutter**.
Migrasi0023 sebelumnya sudah diterapkan; itu bukan dukungan metrics0024.

Pemeriksaan read-only26 Oktober: target runtime/admin cocok;24 migrasi sudah
tercatat, hanya0024 tertunda, tidak ada hash tidak dikenal. Kolom result_metrics
belum ada. Jangan deploy source baru sebelum koordinasi reader dan penerapan0024.
Tidak ada write ke database Neon dalam pekerjaan metrics ini.

Verifikasi lokal:43 tes online/kontrak/migrasi,26 program,12 follow-up,
11 onboarding,16 auth,10 security,11 equipment dan5 movement-tag lolos;
schema smoke, lint/typecheck, secret pattern scan dan referensi OpenAPI diperiksa.
Seluruh mutasi tes memakai PGlite/identitas sintetis, bukan akun/Neon/email nyata.
Build Node24 berhasil setelah reminder keamanan dan retry. Audit26 Oktober masih
menandai1 dependency critical (Next.js16.4.0) dan1 high (Zod4.6.5), belum dipatch
dalam task fitur ini; audit menawarkan Next16.4.3 dan Zod minimal4.6.6.
Build berhasil bukan bukti zero vulnerabilities. Rujukan:
[advisory Next](https://github.com/advisories/GHSA-673q-mjm6-r5xr),
[advisory Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Patch keamanan dan regresi juga perlu sebelum rollout production.
