# Laporan perhitungan kalori dan contoh akun test

Laporan ini menjelaskan implementasi backend yang diperiksa, contoh data akun
`test@mail.com`, dan temuan perbedaan angka pada aplikasi mobile. Data akun
adalah snapshot pada saat pemeriksaan dan dapat berubah jika profil diperbarui.

## 1. Target kalori harian di backend

Backend menggunakan estimasi Mifflin–St Jeor untuk kebutuhan saat istirahat
(BMR), faktor aktivitas, lalu penyesuaian berdasarkan tujuan user. Ini adalah
estimasi awal, bukan hasil pengukuran langsung atau resep medis.

```text
BMR = (10 × berat kg) + (6,25 × tinggi cm) − (5 × usia) + konstanta
```

Konstanta berdasarkan field `formulaSex`: `male` = +5 dan `female` = −161.
Ini adalah input untuk formula nutrisi, tidak digunakan untuk menyimpulkan
identitas gender user.

```text
maintenance = BMR × faktor aktivitas
target      = maintenance + penyesuaian tujuan
```

Hasil maintenance dibulatkan ke kelipatan 10 kkal. Faktor aktivitas yang
digunakan implementasi saat ini:

| `dailyActivity` | Faktor |
| --- | ---: |
| `light` | 1,55 |
| `moderate` | 1,85 |
| `vigorous` | 2,2 |

Kebijakan penyesuaian tujuan saat ini:

| Tujuan | Penyesuaian dari maintenance |
| --- | --- |
| `bulk` | +10%, maksimum +300 kkal |
| `cut` | −15%, maksimum −500 kkal |
| `maintenance` | Tidak ada penyesuaian |

Besar penyesuaian juga dibulatkan ke kelipatan 10 kkal. Perhitungan cut memiliki
penjagaan tambahan: target di bawah 1.500 kkal atau BMI di bawah 20 ditandai
untuk peninjauan, bukan otomatis diberikan sebagai target.

## 2. Contoh berdasarkan akun `test@mail.com`

Data profil dan estimasi yang tersimpan saat diperiksa:

| Data | Nilai |
| --- | --- |
| Usia | 26 tahun |
| Berat | 66 kg |
| Tinggi | 166 cm |
| `formulaSex` | `male` |
| Aktivitas | `moderate` |
| Tujuan | `bulk` |
| Versi profil | `3` |
| Versi formula | `mifflin-pal-goals-v2` |
| Status estimasi | `ready` |

Langkah perhitungannya:

```text
BMR = (10 × 66) + (6,25 × 166) − (5 × 26) + 5
    = 1.572,5 kkal/hari

Maintenance = 1.572,5 × 1,85
            = 2.909,125
            ≈ 2.910 kkal/hari

Penyesuaian bulk = 10% × 2.910
                 = 291, dibulatkan menjadi +290 kkal/hari

Target bulk = 2.910 + 290
            = 3.200 kkal/hari
```

Target protein bulk menggunakan faktor 1,6 g/kg:

```text
66 × 1,6 = 105,6 ≈ 106 gram protein/hari
```

Hasil yang tersimpan pada saat pemeriksaan:

| Field estimasi | Nilai |
| --- | ---: |
| `restingKcal` | 1.572,5 |
| `maintenanceCalories` | 2.910 |
| `calorieAdjustmentKcal` | +290 |
| `calories` | 3.200 |
| `proteinGrams` | 106 |

## 3. Mengapa mobile menampilkan 2.910?

Pada kode mobile yang diperiksa di
`lib/features/catalog/presentation/catalog_cubit.dart`, parser memilih
`estimate.maintenanceCalories` ketika `caloriePolicy` bernilai
`goal_adjusted_v2`. Dengan demikian yang ditampilkan adalah angka sebelum
penyesuaian bulk, yaitu **2.910 kkal**, bukan target setelah penyesuaian yaitu
**3.200 kkal**.

Untuk menampilkan target sesuai tujuan user, mobile perlu membaca
`estimate.calories`. Field `maintenanceCalories` dan `calorieAdjustmentKcal`
tetap dapat ditampilkan sebagai rincian perhitungan bila dibutuhkan. Temuan
ini berdasarkan source mobile lokal yang diperiksa; versi aplikasi yang terpasang
atau deployment API tidak diverifikasi melalui laporan ini. Tidak ada perubahan
kode frontend yang dilakukan dalam penyusunan laporan.

## 4. Kalori workout

Backend tidak menghitung estimasi kalori terbakar dari workout. Durasi, set,
repetisi, dan beban workout tidak otomatis menambah target kalori harian.
Durasi dan volume workout tetap tersedia.

## 5. API dan kondisi hasil

- `GET /api/v1/nutrition/targets`: target dan rincian estimasi nutrisi untuk
  profil aktif. Nilai estimasi disimpan berdasarkan versi profil dan formula.

Backend dapat mengembalikan `incomplete`, `unsupportedAge`, atau `needsReview`
ketika data belum lengkap, berada di luar cakupan model, atau ada kondisi yang
memerlukan peninjauan. Dalam kondisi itu jangan menampilkan nilai kosong
sebagai target nol. Jika snapshot untuk versi profil/formula belum tersedia,
API dapat mengembalikan `ESTIMATE_REBUILD_REQUIRED` tanpa menghitung ulang
melalui request GET.
