# Harga makanan: rujukan internet dan estimasi

Pemeriksaan sumber: **18 Oktober 2026**. Migrasi:
`0018_food_price_estimates`. Nutrisi TKPI, ID makanan, jumlah katalog, dan
riwayat konsumsi pengguna tidak diganti oleh data harga.

Pengguna menyetujui estimasi berlabel dari pangan sejenis bila tidak ada harga
yang cocok, serta pengecualian item yang tidak semestinya diberi harga jual.
**Bukan 1.125 harga produk individual terverifikasi.** Mayoritas adalah proksi
atau model biaya, bukan hasil observasi satu per satu atau survei harga pasar.

## Cakupan

Seluruh **1.145 pangan referensi** memiliki `priceDetails` dalam database:

| Status/metode | Jumlah | Arti |
| --- | ---: | --- |
| `reference_conversion` | 17 | Konversi harga kelas pangan yang cocok dari rujukan ke100g |
| `similar_food_proxy` | 440 | Pembanding pangan sejenis; merek/varietas/spesies/bentuk bisa berbeda |
| `category_proxy` | 427 | Proksi kelompok; keyakinan rendah, bukan harga individual pangan |
| `ingredient_cost_model` | 241 | Model biaya bahan dan asumsi pengolahan, bukan harga menu restoran |
| `not_priced` | 20 | Tanpa angka harga; bukan Rp0/gratis |

Total harga numerik: **1.125**, semuanya `status: estimated`, label
`Estimasi harga, bukan harga jual pasti`. `confidence` medium/low adalah kategori
kecocokan editorial, **bukan probabilitas/statistik interval kepercayaan**.
Jangan mengklaim proksi cocok untuk rekomendasi budget ketat atau menjamin biaya
belanja pengguna. Pangan mentah dalam TKPI bukan anjuran dimakan mentah.

20 pengecualian: `CP020`, `CP070`, `CR004`, `CR051`, `FP004`, `FP054`, `FP059`,
`FP063`, `FP064`, `FP066`, `FP087`, `FR015`, `GP014`, `GR028`, `GR037`, `GR076`,
`HR009`, `HR010`, `JR002`, `KR007`. Termasuk ASI dan beberapa pangan sensitif
yang memerlukan pemeriksaan produk tersendiri. Ini **bukan penetapan hukum atau
keamanan pangan** dan tidak mengubah fakta historis dataset nutrisi. Tidak
dibuat harga pasar fiktif untuk mengejar angka100%.

Tiga demo lama tetap memakai harga ilustrasi/null `priceDetails` dan tidak
ditampilkan secara default. Jumlah di atas tidak mencakup demo.

## Sumber dan cara membaca

Manifest terkurasi:
`src/db/data/food-price-references-2026-10-18.json`. Setiap rujukan menyimpan nama
produk/varian, harga, gram/ml, URL, lokasi yang benar-benar diketahui, cara akses,
tanggal pemeriksaan, tanggal harga bila dinyatakan, dan catatan ketidakpastian.

- [Sayurbox](https://www.sayurbox.com/category/sembako-1-e6a33b51): harga varian
  dari HTML publik, bukan `priceMin` lintas varian. Sumber tambahan kategori
  sayur, buah, protein, makanan siap saji, susu, dan bumbu. Umumnya memakai harga
  reguler varian agar tidak bergantung voucher. URL produk ada pada setiap item.
  Lokasi delivery pengguna tidak dipilih; jangan klaim seluruh quote ini adalah
  harga tepat di alamat Jakarta tertentu. Stok tidak dijamin.
- [SayurAyu](https://sayurayu.com/): beberapa bahan, buah, kacang, rempah dan
  rebon dengan satuan eksplisit, lokasi Surabaya. Tidak mengubah satu ikat atau
  satu pack tanpa berat menjadi gram dengan tebakan.
- [PasarCirebon](https://pasarcirebon.com/harga/): timun dan bawang putih,
  satuan1kg; halaman menyebut penyesuaian1 Oktober2026. Ini harga Cirebon,
  bukan otomatis harga Jakarta.
- Listing penjual di Blibli, antara lain Sayurbox Flagship Store, Sayur Segar
  Bekasi, Rendang Buya, Indocafe dan Sagosan. URL penjual/produk disimpan,
  termasuk sumber yang dibaca lewat indeks pencarian (`access: search_index`).
  Hasil indeks bisa lebih lama daripada tanggal pemeriksaan.
- [Wingko Raden Oleh-Oleh Jogja](https://oleh-olehjogja.com/listing/oleh-oleh-wingko-kelapa-gading-asli-jogja-premium-6e3):
  Rp30.000/250g sebagai pembanding kue tradisional, bukan harga pasti setiap kue.
- [Titan Baking](https://titanbaking.com/product/detail/kacang-mete-belah-4-500-gr):
  isi halaman yang dibaca Rp187.080/500g, berbeda dari indeks; catatan ini
  dipertahankan dan **0,60kg berat kirim tidak dianggap berat bersih**.
- [Daftar supplier24 November2025](https://suppliersayurdanbuah.com/wp-content/uploads/2025/11/Price-List-MBG-Senin-24-Nov-2025.pdf):
  kemiri52.000/kg, secara eksplisit `historical_document`; tidak dinaikkan dengan
  inflasi rekaan atau disebut harga2026.

Harga wilayah/penjual/premium dapat berbeda jauh. Tidak dihitung sebagai
rata-rata nasional/Jakarta. Tidak mengambil nutrisi/klaim kesehatan penjual;
nutrisi tetap menggunakan sumber TKPI yang terpisah.

`checkedAt` berarti tanggal sumber diperiksa, **bukan tanggal pengukuran atau
berlakunya harga**. `sourceDate: null` berarti toko tidak menyatakannya. Harga
promo, indeks pencarian, berat rentang dan rujukan historis dijelaskan pada
`reference.note`/`assumptions`, bukan disembunyikan sebagai harga terverifikasi.

## Perhitungan dan batas

`samplePriceRupiah` pada katalog selalu estimasi per **100g bagian dapat dimakan**:

```text
beratRujukanGram = quantity × massaJenis (hanya bila unit ml)
harga = hargaRujukan × 100 / beratRujukanGram / fraksiBDD / faktorYield
        + tambahanBiayaMasakPer100g
hasil dibulatkan ke Rp100 terdekat, minimum Rp100 untuk estimasi positif
```

- Rentang kemasan400–500g memakai titik tengah450g, **bukan berat terukur**.
- Berat beli dengan kulit/tulang dikonversi memakai BDD TKPI jika tersedia;
  bila kosong, asumsi per kelompok dicantumkan. Fillet/kupas siap timbang yang
  menjadi pembanding memakai basis edible dan tidak dikoreksi BDD dua kali.
- Volume memakai massa jenis asumsi: minyak0,92g/ml, susu1,03g/ml, lainnya1g/ml.
  Semua asumsi disajikan, bukan klaim pengukuran massa jenis produk toko.
- Model biaya: nasi memakai yield3 (tim4) dan tambahanRp800/100g; umbi1 dan
  Rp1.000; kacang rebus2,3; sayur0,9 dan Rp1.500; daging0,75 dan Rp2.500;
  sup4 dan Rp2.000; ikan0,8 dan Rp2.000. Itu **heuristik perencanaan**, bukan
  resep gramasi TKPI terverifikasi. Tidak termasuk laba restoran/tenaga kerja.
- `samplePriceRupiah` tidak menunjukkan total harga kemasan, satu piring,
  satu buah,100ml, maupun nilai yang betul-betul dibayar pengguna.

Contoh data awal: nasiRp1.400/100g adalah **model biaya bahan**, tahuRp1.900/100g
dan tempeRp2.200/100g adalah estimasi pembanding ritel. Jangan mengganti label
menjadi “harga nasi sepiringRp1.400”.

## API dan histori mobile

```http
GET /api/v1/catalog/meals?q=CP061
```

Item katalog tetap mempunyai `samplePriceRupiah`, ditambah `priceDetails`:

```json
{
  "samplePriceRupiah": 1900,
  "priceDetails": {
    "status": "estimated",
    "label": "Estimasi harga, bukan harga jual pasti",
    "currency": "IDR",
    "basisGrams": 100,
    "methodVersion": "internet-reference-estimates-v1",
    "method": "similar_food_proxy",
    "confidence": "low",
    "checkedAt": "2026-10-18"
  }
}
```

Contoh dipendekkan; respons lengkap juga memiliki `reference`, `calculation`,
`assumptions`. `not_priced` memiliki `reasonCode`, harga null, reference/calculation
null. Frontend wajib menampilkan label estimasi dan satuan, boleh menyediakan
detail sumber. Jangan fallback null menjadi0.

Log baru mengambil harga/provenance dari server dan menyimpannya dalam
`snapshot.nutritionDetails.priceDetails`. `samplePriceRupiah` log adalah **per
serving**; total estimasi = harga × servings, bukan dikali dua kali. Nutrisi tetap
otoritatif dari katalog. Client tidak dapat mengubah sumber melalui snapshot.
Edit log mempertahankan harga/sumber saat dicatat, termasuk null pada log lama.
Migrasi tidak memperbarui `meal_entries`, akun, atau data pengguna lain.

API versi lama yang masih live belum mengekspos `priceDetails`; catatan
`sourceNote` katalog juga diberi peringatan estimasi agar harga tidak diam-diam
dianggap terverifikasi. UI/kontrak lengkap membutuhkan deployment kode terbaru.

## Pemeliharaan dan pengujian

```bash
# Read-only, stdout saja; kandidat masih harus direview.
npx tsx scripts/collect-food-price-candidates.ts --compact https://www.sayurbox.com/category/sembako-1-e6a33b51
# Reproduksi migration0018 persis, tanpa internet/database:
npx tsx scripts/build-food-prices-migration.ts
npm run test:food-prices
npm run test:food-catalog
npm run db:test-schema
# Read-only terhadap database terkonfigurasi:
npm run catalogs:audit
```

Collector tidak login, mengevaluasi JavaScript pihak ketiga, membaca.env,
menulis DB atau melakukan crawl otomatis seluruh situs. Harga selalu dipin
sebagai data migrasi terkurasi, tidak di-scrape saat request API/build.

Pembaruan berikutnya harus memakai manifest dan migrasi **baru**; jangan edit
migrasi yang sudah diterapkan. Versi katalog/baris naik otomatis lewat trigger,
sehingga mobile perlu refetch katalog sesuai kontrak pagination yang ada.
Tidak ada scheduler refresh harga otomatis. Periksa ulang terutama quote
berbeda indeks, historis, proksi kelompok, dan harga tanpa tanggal berlaku.

## Status verifikasi implementasi

Pada18 Oktober2026 migrasi0018 sudah diterapkan ke database yang terhubung.
Audit read-only menemukan1.125 estimasi,20 pengecualian,0 metadata harga hilang
dan0 metadata/perhitungan tidak valid. Preflight keamanan/TLS/role lolos.
Tes harga3, katalog6, nutrisi19, keamanan10, follow-up mobile12, schema smoke,
lint, typecheck dan build production Node24 berhasil.

Build production lokal juga diuji read-only terhadap database nyata pada seluruh
12 halaman/1.145 makanan: angka, label dan metadata konsisten. Server uji
dihentikan setelah pemeriksaan. Uji publik Vercel `q=CP061` mengembalikanRp1.900
dan peringatan estimasi dalam sourceNote, tetapi **belum priceDetails** karena
kode terbaru belum di-deploy oleh pekerjaan ini. Tidak melakukan commit/push,
redeploy, perubahan data pengguna, atau menjalankan worker penghapusan akun.
