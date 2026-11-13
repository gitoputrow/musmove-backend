# Estimasi kebutuhan nutrisi

Backend menyediakan estimasi kalori/protein milik akun.
Semua endpoint privat menggunakan bearer token Neon Auth; tidak menerima
`userId` dari client.

## Penyimpanan dan rumus

Input tetap di `profiles`: `ageYears`, `weightKg`, `heightCm`, `formulaSex`,
`dailyActivity`, `goal`, dan `trainingContext`. Gender identitas tidak
dianggap sebagai pengganti `formulaSex`; tidak ada nilai tubuh default.

Setiap upsert profil yang berhasil membuat snapshot server-owned di
`nutrition_estimates`, dalam transaksi yang sama dengan profil, change log,
dan receipt. Key `(user_id, profile_version, formula_version)` mencegah
duplikasi. Snapshot menyimpan input, status/alasan, REE, kalori maintenance,
goal ternormalisasi, penyesuaian kalori, target kalori akhir, faktor protein,
protein target/min/max, dan waktu perhitungan. Versi lama tetap ada untuk audit;
GET hanya membaca versi profil aktif yang cocok, bukan snapshot lama.
Delete/tombstone profil menghentikan penyajian target; delete akun menghapus
snapshot lewat FK cascade. Client tidak dapat mengirim target melalui sync.

Versi API aktif: `mifflin-pal-goals-v2`. Snapshot lama
`mifflin-pal-protein-v1` tidak ditimpa.

- REE = `10 × kg + 6.25 × cm − 5 × usia + offset`; offset male `+5`, female `−161`.
- Kalori maintenance = REE × faktor aktivitas, dibulatkan ke kelipatan 10 terdekat.
- Faktor light `1.55`, moderate `1.85`, vigorous `2.2` adalah pilihan representatif
  dalam rentang PAL FAO, bukan pengukuran aktivitas individu. REE digunakan
  sebagai pendekatan pengeluaran basal dalam model gabungan ini.
- Tidak ada multiplier tambahan dari frekuensi latihan/durasi/motivasi.

Penyesuaian menggunakan goal yang tersimpan di profil. Ini **kebijakan awal
produk untuk orang dewasa yang berolahraga**, bukan angka optimal universal
atau protokol klinis yang divalidasi. Perlu review berdasarkan tren berat,
kecukupan makan, performa, dan konteks kesehatan; tidak memprediksi laju
perubahan berat atau menjamin hasil. Tidak ada auto-tuning dari satu kali timbang.

| Goal API | Penyesuaian dari maintenance | Protein target / rentang |
| --- | --- | --- |
| `bulk` | Sekitar +10%, maksimum +300 kcal/hari | 1.6 g/kg / 1.4–2.0 g/kg |
| `cut` | Sekitar −15%, maksimum −500 kcal/hari | 2.0 g/kg / 1.6–2.0 g/kg |
| `maintenance` | 0 kcal | 1.6 g/kg / 1.4–2.0 g/kg |

Besaran penyesuaian = `round(min(maintenance × abs(ratio), cap) / 10) × 10`,
dengan tanda positif untuk bulk dan negatif untuk cut. Target akhir =
maintenance + penyesuaian. Persentase bersifat perkiraan karena pembulatan;
cap tetap 300/500 kcal. Protein dibulatkan ke gram. Pemilihan protein cut
di ujung atas rentang adalah default produk, bukan klaim kebutuhan semua user.

API mengembalikan `caloriePolicy: goal_adjusted_v2`, `goalPolicies`, `cutGuards`,
serta `goalAdjustmentApplied` (true hanya bila estimasi ready dan penyesuaian
kalori bukan nol). Di `estimate`, `calories` sekarang adalah **target akhir**;
`maintenanceCalories` baseline, `calorieAdjustmentKcal` perubahan bertanda,
`normalizedGoal` goal API, dan `proteinFactor` g/kg yang dipakai.

Goal aliases (case-insensitive, whitespace di-trim):

- Bulk: `bulk`, `bulking`, `muscle`, `muscle_gain`.
- Cut: `cut`, `cutting`, `fat`, `fat_loss`.
- Maintenance: `maintain`, `maintenance`, `maintance`, `fit`, `general`,
  `general_fitness`, `strength`, `endurance`.

Goal kosong menghasilkan `incomplete / NUTRITION_GOAL_REQUIRED`; tidak dikenal
`incomplete / NUTRITION_GOAL_UNSUPPORTED`. Target tidak diam-diam berubah
menjadi maintenance. Tidak ada asumsi goal berdasarkan gender/BMI.

Contoh fixture, bukan saran diet individu: profil 25 tahun, male formula,
70 kg, 175 cm, light menghasilkan maintenance 2590 kcal. Target bulk 2850
kcal/112 g protein, cut 2200 kcal/140 g protein, maintenance 2590 kcal/112 g.

Perhitungan **baseline maintenance** mempertahankan kontrak estimator Dart.
`tests/fixtures/nutrition-v1.json` dipakai test TypeScript **dan** harness Dart
yang membaca estimator asli di sibling repo `../musmove`. Penyesuaian goal v2
diuji tersendiri; estimator lokal Flutter masih baseline v1 dan **belum**
goal-aware. Saat diintegrasikan, mobile harus memakai target v2 dari API,
bukan menambahkan penyesuaian kedua di atas `estimate.calories`.
Tidak ada perubahan kode mobile untuk pengujian ini. Jalankan `npm run test:nutrition-dart` bila
Dart SDK dan repo sibling tersedia.

Sumber primer: [Mifflin 1990](https://pubmed.ncbi.nlm.nih.gov/2305711/),
[FAO/WHO/UNU PAL](https://www.fao.org/4/y5686e/y5686e07.htm),
[ISSN 2017](https://link.springer.com/article/10.1186/s12970-017-0177-8), dan
[Morton 2018](https://pubmed.ncbi.nlm.nih.gov/28698222/).
Konteks surplus untuk atlet: [off-season review 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/).
Ruang lingkup planner dewasa/non-hamil dan non-menyusui:
[NIDDK](https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner).
Sumber tersebut tidak menetapkan kebijakan produk persis +10%/−15%, cap
300/500, guard 1500/BMI20, atau menjamin bahwa formula ini sesuai setiap orang.

## Status, guard, dan lifecycle

`GET /api/v1/nutrition/targets` mengembalikan metadata formula dan `estimate`:

| Status | Perilaku |
| --- | --- |
| `ready` | Ada kalori/protein, input lengkap dan lolos guard |
| `incomplete` | Usia, input tubuh/formula/aktivitas atau goal belum lengkap/didukung; angka null |
| `unsupportedAge` | Usia di luar 19–78; angka null, sesuai guard mobile |
| `needsReview` | Input perlu review atau ada konteks khusus; angka null |

Guard mobile yang dipertahankan: berat 30–250 kg, tinggi 120–220 cm,
BMI `[18.5, 30)`. Guard BMI adalah kebijakan produk konservatif, **bukan diagnosis**
atau klaim bahwa studi Mifflin tidak mencakup obesitas. Backend menambah
guard hamil/postpartum dan `healthStatus: needs_professional_guidance`,
independen dari gender/formulaSex. Backend tidak menghitung target khusus
kehamilan atau kebutuhan untuk penyakit. Tidak melaporkan kondisi kesehatan
bukan bukti telah mendapat clearance; estimator tetap bersifat perkiraan.

Tambahan khusus cut: BMI `<20` menghasilkan `CUT_BODY_COMPOSITION_REVIEW`;
target akhir `<1500` kcal menghasilkan `CUT_TARGET_TOO_LOW`. Keduanya
`needsReview` dengan semua angka target null. Ini guard produk konservatif,
**bukan batas medis universal**, dan angka di atas 1500 tidak membuktikan
kecukupan energi/nutrisi. Backend tidak diam-diam clamp, memberi target
maintenance sebagai pengganti cut, atau mengurangi lebih jauh. Konteks hamil,
postpartum dan kebutuhan arahan profesional tetap memblokir semua goal.

Belum ada profil: `estimate: null`, `reason: PROFILE_REQUIRED`.
Snapshot versi formula/profil belum tersedia: `ESTIMATE_REBUILD_REQUIRED`;
GET tidak menulis database dan tidak menyajikan angka stale.

Setelah migrasi awal, atau saat versi formula berubah, jalankan:

```bash
npm run db:migrate
npm run db:backfill-nutrition
```

Backfill idempotent, berhalaman, memakai urutan lock sync yang sama, dan
tidak mengubah profil, version, atau change log. Snapshot baru juga dibuat
saat import demo. Import yang gagal membatalkan snapshot dan seluruh entitas.
Mobile mengambil ulang `/nutrition/targets` setelah ACK perubahan profil,
bootstrap, atau pull profil; estimasi bukan entitas mutable pada stream sync.
Mengubah goal lewat sync juga membuat snapshot baru tanpa mengubah snapshot target versi lama. Backfill v2 menambah snapshot baru bagi versi
profil aktif, tanpa menulis ulang hasil v1. Selama belum dibackfill, GET memberi
`ESTIMATE_REBUILD_REQUIRED`, bukan target lama.

