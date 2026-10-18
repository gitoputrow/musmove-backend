# Follow-up frontend: penyederhanaan katalog makanan

Tanggal: 18 Oktober 2026.

Dokumen ini membahas perubahan terbaru pada katalog makanan, bukan perubahan
seluruh fitur backend. Base URL API: `https://musmove-backend.vercel.app/api/v1`.

## 1. Status handoff

- Kode backend, schema Drizzle, dokumentasi OpenAPI, dan migrasi `0019_simplify_meal_catalog` sudah disiapkan.
- Tes katalog, harga, jurnal/sync, nutrisi, keamanan, schema database lokal, lint, typecheck, dan production build lolos.
- Pada pengecekan terakhir, API production masih mengirim field lama. Kode baru belum terkonfirmasi ter-deploy, dan migrasi penghapusan kolom **belum dijalankan di production**.
- Kontrak di bawah adalah kontrak kode terbaru. Backend harus mengonfirmasi deployment sebelum frontend menganggap production sudah berubah.

## 2. Perubahan yang perlu ditangani frontend

Tiga kolom dihapus **hanya dari `meal_catalog`**. Setelah migrasi, tabel ini
memiliki 22 kolom, bukan 25.

| Kolom database yang dihapus | Field API yang dihapus | Tindakan frontend |
| --- | --- | --- |
| `meal_type` | `mealType` pada item katalog | Jangan menentukan waktu makan dari katalog. Pengguna memilihnya saat mencatat konsumsi. |
| `portion_label` | `portionLabel` | Buat label porsi dari `portionGrams`, misalnya `100 g`. |
| `food_kind` | `foodKind` | Hapus properti model, chip/filter jenis ini, dan query parameter `foodKind`. Untuk kelompok makanan gunakan `foodGroup`. |

`foodGroup` bukan pengganti klasifikasi mentah/olahan. Kondisi makanan, misalnya
mentah atau rebus, tetap dapat tercantum pada `idLabel`.

**Jangan menghapus `mealType` pada model jurnal konsumsi (`MealEntry`) atau payload
pencatatan makanan.** Yang berubah adalah model item katalog (`MealCatalogItem`).
Nilai waktu makan tetap `breakfast`, `lunch`, `dinner`, atau `snack`.

## 3. Endpoint dan filter katalog

```http
GET /api/v1/catalog/meals?q=tempe&foodGroup=legumes&limit=50&offset=0
GET /api/v1/catalog/meals?q=AP001
```

Endpoint katalog bersifat publik dan tidak memerlukan token. Endpoint jurnal
dan sync tetap memerlukan autentikasi seperti sebelumnya.

| Parameter | Aturan |
| --- | --- |
| `q` | Opsional; 1–120 karakter setelah trim. Pencarian literal nama Indonesia/Inggris atau kode sumber, tidak peka huruf besar/kecil. |
| `foodGroup` | Opsional; salah satu kelompok di bawah. |
| `includeDemo` | `true` atau `false`; default `false`. Gunakan `false` untuk katalog produksi. |
| `limit` | Bilangan bulat 1–100; default 50. |
| `offset` | Bilangan bulat 0–100000; default 0. |

Kelompok yang valid: `cereals`, `tubers`, `legumes`, `vegetables`, `fruits`,
`meat_poultry`, `fish_seafood`, `eggs`, `dairy`, `fats_oils`,
`sugars_confectionery`, `condiments`, `beverages`.

Pada kode baru, request `?foodKind=single` menghasilkan **HTTP 400**, bukan filter
yang diabaikan. Parameter asing, duplikat, atau nilai tidak valid juga ditolak.
Jangan kirim `mealType` atau `portionLabel` sebagai filter katalog.

Respons tetap berisi `catalogVersion`, `total`, `hasMore`, `nextOffset`, `meals`,
`warning`, dan `warnings`. Lanjutkan pagination memakai `nextOffset` sampai
`hasMore` bernilai `false`; jangan menganggap halaman pertama adalah seluruh katalog.

## 4. Field item katalog setelah perubahan

Nama field API memakai camelCase, bukan nama kolom SQL.

| Field | Tipe JSON |
| --- | --- |
| `id` | string |
| `idLabel` | string |
| `enLabel` | string atau null |
| `portionGrams` | number atau null |
| `foodGroup` | string enum kelompok atau null |
| `caloriesKcal` | number |
| `proteinGrams` | number |
| `carbohydrateGrams` | number atau null |
| `fatGrams` | number atau null |
| `fiberGrams` | number atau null |
| `sodiumMg` | number atau null |
| `samplePriceRupiah` | integer atau null |
| `priceDetails` | object atau null |
| `sourceType` | `reference` atau `demo` |
| `sourceNote` | string |
| `sourceUrl` | string atau null |
| `sourceCode` | string atau null |
| `sourceCheckedAt` | tanggal `YYYY-MM-DD` atau null |
| `sourceDetails` | object atau null |
| `active` | boolean |
| `version` | string desimal, bukan number |
| `updatedAt` | string tanggal/waktu ISO 8601 |

Struktur lengkap object metadata tersedia pada schema `MealCatalogItem`,
`FoodPriceDetails`, dan `FoodSourceDetails` di [OpenAPI](openapi.yaml).
`catalogVersion` juga berupa string desimal.

## 5. Porsi, nutrisi, dan harga pada UI

- Pangan referensi TKPI memakai `portionGrams: 100`, yaitu **100 g bagian yang dapat dimakan**. Nilai nutrisi item berlaku per porsi katalog tersebut, bukan per piring.
- Untuk input gram, hitung `servings = beratGram / portionGrams`. Contoh nasi `tkpi-ap001`: 150 g berarti `servings: 1.5`, dengan total 270 kcal dan protein 4,5 g.
- Jangan menganggap 100 ml sama dengan 100 g. Gunakan berat bagian yang benar-benar dapat dimakan dan kondisi bahan yang sesuai.
- Jika `portionGrams` null, jangan membagi dengan null atau otomatis menganggap 100 g. Tampilkan `Porsi tidak tersedia` atau gunakan alur input manual; berat porsi demo memang tidak diketahui.
- `enLabel` null harus fallback ke `idLabel`. Nutrien null berarti belum tersedia, bukan nol.
- Harga numerik merupakan **estimasi**, bukan harga toko real-time atau harga satu piring. Tampilkan label estimasi dan basis porsinya; gunakan metadata `priceDetails` bila tersedia.
- `samplePriceRupiah` pada katalog maupun jurnal adalah harga per porsi katalog, **bukan otomatis total untuk seluruh `servings`**. Jika UI menghitung perkiraan biaya konsumsi, kalikan sendiri dengan `servings` dan tetap beri label estimasi.
- Harga null bukan gratis. Tampilkan `Harga tidak tersedia`; jangan mengubahnya menjadi Rp0. Pada kontrak baru, pengecualian harga dijelaskan melalui `priceDetails.status: not_priced`.
- Nutrisi referensi dapat ditelusuri ke TKPI, tetapi bukan hasil uji lab independen untuk setiap makanan pengguna. Harga berasal dari rujukan terpisah, bukan TKPI.

## 6. Pencatatan konsumsi tidak berubah

Gunakan alur `/sync/push` yang sudah ada dengan `entityType: meal_entry`.
Berikut contoh **payload entitas saja**, bukan keseluruhan envelope sync:

```json
{
  "menuName": null,
  "note": null,
  "samplePriceRupiah": null,
  "snapshot": {},
  "catalogId": "tkpi-ap001",
  "servings": 1.5,
  "consumedAt": "2026-10-18T07:00:00+07:00",
  "recordedOn": "2026-10-18",
  "mealType": "breakfast"
}
```

Untuk pilihan katalog, backend menentukan nama, nutrisi, harga, dan metadata
snapshot dari database. Frontend tidak perlu mengirim field katalog yang dihapus
atau membuat `snapshot.nutritionDetails` sendiri. Gunakan tanggal konsumsi yang
sebenarnya; tanggal contoh di atas bukan nilai yang harus di-hardcode.

Jurnal lama dan snapshot historis tetap dipertahankan. Snapshot lama masih boleh
memiliki `portionLabel` atau `foodKind`; parser jangan gagal karena field tambahan
tersebut. Jangan menulis ulang jurnal lama menggunakan harga/nutrisi katalog terbaru.

## 7. Checklist implementasi frontend

- [ ] Hapus tiga properti dari model/DTO katalog dan generator serialisasinya; pertahankan `MealEntry.mealType`.
- [ ] Hapus query `foodKind`, termasuk default filter, state tersimpan, dan request hasil pemulihan cache.
- [ ] Hapus ketergantungan tampilan terhadap `portionLabel`; gunakan gram dan fallback null.
- [ ] Pastikan pilihan waktu makan tetap tersedia pada form pencatatan.
- [ ] Abaikan field tambahan dari respons/cache lama agar frontend baru dapat berjalan selama rollout backend.
- [ ] Invalidasi atau migrasikan cache katalog lama tanpa menghapus jurnal maupun antrean sync pengguna.
- [ ] Pada rilis frontend dengan kontrak baru, lakukan refresh katalog awal; jangan hanya menunggu perubahan `catalogVersion` karena deployment kode dapat mendahului migrasi database.
- [ ] Bila `catalogVersion` berubah saat mengambil beberapa halaman, ulangi pengambilan dari offset 0 agar data tidak tercampur.
- [ ] Uji parsing respons tanpa tiga field tersebut, null pada field opsional, pagination, pencatatan 150 g, dan pembacaan jurnal lama.
- [ ] Uji harga estimasi, harga null, dan pastikan harga per porsi tidak ditampilkan sebagai biaya total konsumsi.

## 8. Urutan rollout bersama backend

1. Siapkan frontend yang tidak membutuhkan tiga field lama dan tidak mengirim filter `foodKind`. Versi ini dapat disiapkan/diluncurkan sebelum backend baru karena parser mengabaikan field tambahan.
2. Backend deploy kode terbaru ke Vercel. Periksa `GET /api/v1/catalog/meals`: harus 200 dan item tidak lagi memiliki `mealType`, `portionLabel`, atau `foodKind`.
3. Pastikan frontend yang masih digunakan tidak bergantung pada field/filter lama. Ini perubahan kontrak pada `/api/v1` yang sama; tidak ada jaminan kompatibilitas untuk aplikasi lama yang masih mengirim `foodKind` atau mewajibkan field yang dihapus.
4. Pengelola backend menjalankan migrasi `0019_simplify_meal_catalog` setelah kode API lama tidak lagi melayani request ke database tersebut. Jangan rollback ke kode API lama sesudah kolom dihapus.
5. Migrasi menaikkan `catalogVersion`; frontend mengambil ulang katalog. Jalankan smoke test katalog dan pencatatan konsumsi.

Frontend **tidak** menjalankan migrasi SQL, menyimpan kredensial database, atau
mengakses Neon secara langsung. Alur autentikasi, endpoint jurnal, dan target
kalori/protein tidak diubah oleh penyederhanaan katalog ini.

Rujukan lanjutan: [integrasi mobile dan auth](mobile-integration.md),
[katalog pangan](food-catalog.md), [nutrisi dan jurnal](meals-nutrition.md),
serta [metode dan batas estimasi harga](food-prices.md).
