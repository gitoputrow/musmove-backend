# Follow-up frontend: hapus estimasi kalori workout, pertahankan durasi

Tanggal: 27 Oktober 2026.

Keputusan produk: **tidak ada estimasi kalori workout**. Hasil tetap menampilkan
durasi total, set/repetisi, volume beban eksternal, waktu tahan jika ada, dan peta
otot. Dokumen ini menggantikan bagian energi/MET dalam kontrak metrics sebelumnya.
Perubahan ini hanya mengubah source backend dan dokumentasi; bukan deployment
Vercel atau perubahan kode Flutter.

## 1. Perubahan kontrak

Endpoint tetap `POST /api/v1/workouts`, satu submit final dengan Bearer JWT dan
`Idempotency-Key`. Tidak ada endpoint perhitungan kalori, preview baru, atau
request tambahan. Manual bebas mode, program, snapshot dan submit atomik tetap.

Field berikut **dihapus dari request**:

- `energyActivityCode`.
- `workoutBodyweightKg`.

Jika masih dikirim, termasuk dengan nilai `null`, backend mengembalikan
**400 VALIDATION_ERROR**. Hapus key tersebut, bukan mengganti nilainya menjadi
null/0. Payload tetap strict. Jangan mengirim kcal, MET atau `resultMetrics`;
`resultMetrics` adalah data server-owned, bukan input.

Backend tidak lagi memilih kategori MET, menghitung kalori, menyalin berat/usia
profil untuk energi workout, atau melakukan query profil untuk perhitungan ini.
Tidak ada rumus pengganti dari set/reps/beban atau pemetaan intensitas otomatis.

## 2. Durasi waktu tetap ada

**Jangan hapus field durasi total dari form record workout.** Nilainya termasuk
istirahat dan transisi, bukan waktu aktif/moving time atau jumlah waktu tahan.
Ubah menit input mobile menjadi detik integer saat submit. Contoh 45 menit:

```json
{ "sessionTiming": { "source": "user_reported", "durationSeconds": 2700 } }
```

`user_reported` hanya untuk `source:"manual"`, 1–43200 detik. Tanggal pilihan
tetap dikirim melalui `recordedOn`; timestamp placeholder tanggal bukan bukti
durasi manual, dan tidak perlu direkayasa agar selisihnya sama dengan input durasi.

Untuk sesi timer manual/custom/recommended, tetap gunakan:

```json
{ "sessionTiming": { "source": "timer" } }
```

Timer dihitung backend dari `finishedAt - startedAt`, floor ke detik. Jangan
mengirim `durationSeconds` dalam object timer. Batas 1–43200 detik tetap berlaku.
Tanpa `sessionTiming`, durasi tetap unknown demi kompatibilitas histori lama;
bukan nol, bukan penjumlahan hold. API tidak membuat input ini wajib untuk semua
client lama; UI record mobile yang sudah memiliki input durasi tetap mempertahankannya.

Jumlah hold completed yang diketahui tidak boleh melebihi durasi sesi eksplisit.
Validasi tanggal/timestamp dan rollback atomik tetap berlaku.

## 3. Hasil baru: resultMetrics version2

Hasil submit baru selalu memiliki `version:"2"`, `duration`, dan `muscles`.
Tidak ada key `energy`, bahkan object berisi null pun tidak dibuat.
Contoh struktur (pemetaan otot ditentukan referensi exercise kanonis):

```json
{
  "version": "2",
  "duration": {
    "seconds": 2700,
    "source": "user_reported",
    "reason": null,
    "meaning": "elapsed_including_rest",
    "verification": "client_reported"
  },
  "muscles": {
    "coverage": "complete",
    "primary": ["chest"],
    "secondary": ["shoulders", "triceps"],
    "completedExerciseCount": 1,
    "unknownExercises": [],
    "mappingVersion": "1"
  }
}
```

Respons tetap `{item,exercises}`. Gunakan snapshot dari ACK final atau histori.
Parser menerima metrics2 baru, metrics1 historis, serta null/absent pada histori
lama. Jangan mensyaratkan `energy` untuk membaca durasi atau peta otot.

## 4. Perubahan UI dan ringkasan mobile

- Hapus kartu/label/kcal estimasi workout di preview, hasil selesai, detail
  histori, statistik dan share/export jika ada. Jangan menggantinya dengan `0`
  atau `—` karena fitur memang dihapus, bukan sedang gagal dihitung.
- Hapus pilihan jenis aktivitas/intensitas khusus MET serta input berat badan
  tambahan untuk estimasi kalori. Jangan hapus pilihan exercise/mode.
- Jangan menghitung kalori lokal atau menambah/mengurangi kalori workout dari
  target makanan. Tidak perlu meminta berat hanya agar workout bisa disimpan.
- Tetap tampilkan durasi sesi, set/repetisi aktual, volume eksternal dan peta otot.
- Volume adalah jumlah `reps aktual × weightKg aktual` setiap **repetition set
  completed** dengan referensi snapshot yang cocok. Target reps/beban bukan hasil.
  Contoh dua set 10×40 kg dan 8×45 kg menghasilkan **760 kg**, bukan target 800 kg.
- `weightKg:0` berarti nol beban eksternal, bukan tidak berlatih. Jangan tambahkan
  berat badan profil ke volume bodyweight. Unknown/null bukan0 dan membuat total
  pada cakupannya unknown, bukan subtotal tanpa label.
- Set duration/hold tetap dicatat dalam detik, tidak dikonversi menjadi reps×kg.
  Volume nol pada hold/bodyweight tidak menghilangkan peta ototnya.
- Identitas manual tetap pasangan `(mode,id)` dan nomor set; jangan mencampur
  exercise dua mode hanya karena ID katalog sama.

`GET /statistics` tetap memakai `reportedExternalVolumeKg`, `reportedReps`,
`completedSets`, `totalHoldSeconds`, `durationMinutes`, `knownDurationMinutes`, dan
counter missing yang sudah ada. Tidak ada kolom agregat kalori workout baru.
Detail cakupan unknown dan otot tetap ada di
[kontrak hasil workout](frontend-follow-up-workout-result-metrics.md).

## 5. Histori, retry dan rollout

Snapshot/receipt metrics1 lama **tidak dihapus atau ditulis ulang**. Bila pernah
tersimpan, key `energy` historis masih dapat terbaca di GET/bootstrap/snapshot
atau replay receipt asli. Abaikan key itu di UI; bukan fitur kalori yang aktif.
Read tidak melakukan kalkulasi ulang. Metrics2 tidak mempunyai key tersebut.

Retry payload baru tetap memakai ID, body dan key yang persis sama. Payload lama
yang berisi field energi sekarang gagal400 **sebelum** lookup receipt. Jika ada
submit lama yang hasilnya belum pasti, jangan diam-diam mengganti body/key lalu
membuat workout kedua. Rekonsiliasi lewat GET workout dengan ID milik akun:
periksa apakah catatan sudah tersimpan. Jika belum, lakukan retry/migrasi draft
secara eksplisit tanpa menduplikasi workout; key yang pernah berhasil untuk body
berbeda tetap menyebabkan409. Kebijakan ini perlu ditangani sebelum rollout.

Tidak ada migrasi DB tambahan khusus penghapusan kalori: kolom JSONB
`result_metrics` tetap menyimpan durasi dan otot. **Migrasi0024 tetap prasyarat**
bila kolom/dukungan metrics belum ada; jangan deploy ke DB yang belum sesuai.
Pekerjaan ini tidak menjalankan migrasi atau memeriksa status Neon terkini.
Tidak ada perubahan riwayat, profil, receipt, atau data production.

Meta source menandai `workoutResultMetrics:true`, `workoutResultMetricsV2:true`,
dan `workoutCalorieEstimates:false`. Ini bukan bukti cloud sudah deploy dan
**bukan alasan menambah request /meta saat startup**. Gunakan kontrak rollout.

Kalori katalog makanan, jurnal makan, target kalori/protein dan berat di profil
tetap digunakan fitur nutrisi. `bodyweightKg` pada assessment kemampuan latihan
juga bukan `workoutBodyweightKg` yang dihapus di sini.

## 6. Checklist frontend

- Form manual: tanggal + durasi total + exercise + set/reps/beban tetap tersedia.
- Submit tanpa dua key energi lama; cek ACK version2 tanpa `energy`.
- Durasi hasil/histori sama dengan input, termasuk istirahat.
- Preview/histori version1/null tidak crash dan tidak menampilkan kcal.
- Volume 760 kg pada contoh tetap benar, null tidak berubah menjadi0.
- Bodyweight dan hold tetap bisa disimpan dan menyorot otot yang diketahui.
- Error/retry tidak menghapus draft atau membuat duplikasi.
- Nutrisi dan data profil tidak ikut dihapus.

## 7. Verifikasi backend

Pemeriksaan lokal27 Oktober2026: 45 tes online/metrics/kontrak/migrasi dan19 tes
nutrisi lulus; lint serta TypeScript typecheck lulus. Tes mencakup metrics2 tanpa
energy, penolakan key lama secara atomik, durasi manual/timer, volume760 kg,
peta otot, dan read/replay metrics1 tanpa perubahan snapshot/receipt.
Database tes memakai PGlite dan identitas sintetis, tanpa koneksi data produksi.
Build/deploy cloud dan QA Flutter/perangkat tidak dijalankan dalam pekerjaan ini.
