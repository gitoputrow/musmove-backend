# Katalog pangan rujukan

Migrasi `0014_reference_food_catalog` menambahkan **1.145 pangan referensi**
ke `meal_catalog`, bukan array hardcoded pada API. Tiga demo lama tetap ada
untuk kompatibilitas/history dan tidak ditampilkan secara default. Flutter
belum dihubungkan ke API ini.

## Sumber dan arti verifikasi

Sumber primer: **Tabel Komposisi Pangan Indonesia 2017**, Direktorat Gizi
Masyarakat, Kementerian Kesehatan RI; halaman judul menyebut terbit 2018.
[Entri resmi Kemenkes](https://repository.kemkes.go.id/book/777) menautkan
[PDF 135 halaman](https://drive.google.com/file/d/1SC04gfuVmT--4-JegrOBM36mw_vwssvM/view).
Diakses/dicocokkan pada **2026-10-17**, bukan tahun pengukuran pangan.

SHA-256 PDF yang digunakan:
`12433fb4803c47ecbc89dc5981e3ee80717313ccf1b756b8189ebffca4e1d382`.

Snapshot JSON juga dipin SHA-256 pada tes agar perubahan fakta tidak lolos
diam-diam: `dd204189b487644d3db831ff2b02246fdebb6a1677acf8ec477f46b0f8bf072f`.

Verifikasi di sini berarti **transkripsi dapat dilacak dan diuji terhadap
tabel sumber**, bukan sertifikasi, peninjauan ahli gizi atas setiap makanan,
atau pengujian laboratorium independen produk/porsi pengguna. TKPI sendiri
menggabungkan hasil analisis, perhitungan, asumsi, imputasi dan borrowed values
(penjelasan cetak hal. 4–6 / PDF 11–13). Resep, varietas, merek, dan cara masak
nyata dapat berbeda. Jangan mengiklankan seluruh angka sebagai hasil lab.

Seluruh **1.146 kode** pada tabel PDF hal. 16–70 disimpan dalam snapshot
`src/db/data/tkpi-2017.json`. Hanya **MP013 Melase** yang tidak diimpor sebagai
pilihan pencatatan, karena kolom protein sumber kosong. Tidak diisi nol atau
diambilkan angka dari pangan lain. Tidak ada entri fiktif untuk menambah jumlah.

| `foodGroup` | Kelompok | Entri aktif |
| --- | --- | ---: |
| `cereals` | Serealia dan olahan | 135 |
| `tubers` | Umbi berpati dan olahan | 109 |
| `legumes` | Kacang, biji, bean dan olahan | 138 |
| `vegetables` | Sayuran dan olahan | 227 |
| `fruits` | Buah dan olahan | 127 |
| `meat_poultry` | Daging, unggas dan olahan | 122 |
| `fish_seafood` | Ikan, kerang, udang dan olahan | 179 |
| `eggs` | Telur dan olahan | 18 |
| `dairy` | Susu dan olahan | 17 |
| `fats_oils` | Lemak dan minyak | 18 |
| `sugars_confectionery` | Gula, sirup, konfeksioneri | 17 |
| `condiments` | Bumbu | 37 |
| `beverages` | Minuman (kelapa muda, air) | 1 |

Ini cakupan edisi TKPI tersebut, **bukan seluruh makanan/merek di dunia**.
Kopi/teh kering dalam TKPI berada pada kelompok gula/konfeksioneri; tidak
dipindahkan menjadi minuman seduh dengan angka nutrisi yang sama. Kategori
dan kondisi bahan mengikuti sumber, bukan penilaian apakah makanan sehat
atau cocok untuk goal tertentu. Pangan mentah bukan anjuran untuk dimakan mentah.

## Data yang disimpan

- ID stabil `tkpi-ap001`, nama asli, kelompok, jenis `single` atau
  `processed_or_composite`, dan porsi **100 g bagian dapat dimakan (BDD)**.
- `caloriesKcal`, `proteinGrams`, `carbohydrateGrams`, `fatGrams`,
  `fiberGrams`, `sodiumMg` adalah nilai **per satu porsi katalog**.
- `sourceType: reference`, URL Kemenkes, kode TKPI, tanggal pemeriksaan.
- `sourceDetails`: dataset, halaman PDF (1-based), halaman cetak, rujukan
  asli di kolom SUMBER, persen BDD, daftar nilai berwarna biru
  (`imputedOrBorrowedFields`), nutrien tambahan dan nilai yang ditahan.
- `additionalNutrients`: air/abu (g), kalsium/fosfor/besi/kalium/tembaga/seng
  (mg), retinol/beta-karoten/karoten total (mcg), tiamin/riboflavin/niasin/
  vitamin C (mg). Nama field mencantumkan satuan.

Kolom kosong atau tanda `-` menjadi **null**, bukan nol. Nilai nol sumber
dipertahankan; menurut TKPI, dapat berarti tidak ada atau trace/tidak terdeteksi.
`fiberGrams` tidak diklaim pasti serat pangan: TKPI menyebut metode/jenis serat
belum dapat dibedakan per bahan (cetak hal. 4). Gula total, lemak jenuh, vitamin D,
dan nutrien lain yang tidak ada dalam sumber **tidak dibuat-buat**.

Penanda biru tidak dibuang saat ekstraksi. Ia menunjukkan imputasi/borrowed
value, bukan bukti analisis lab. Angka non-biru juga tidak otomatis berarti
hasil lab; ada nilai presumed/calculated yang dijelaskan TKPI.

Penapisan editorial menahan **21 nilai tambahan pada 20 pangan** yang perlu
review: abu >100 g, tembaga >50 mg, tiamin/riboflavin >10 mg, niasin >100 mg
per 100 g. Ini **pemicu review konservatif, bukan ambang medis** dan bukan
jaminan bahwa nilai di bawahnya pasti benar. Contohnya abu CP070 =146.3 g,
tembaga CP086 =4303.45 mg, dan beberapa nilai tembaga buah. Sel sumber
representatif sudah diperiksa visual. Field terkait disajikan `null`;
`withheldNutrients` menyimpan angka sumber dan alasan `SOURCE_OUTLIER_REQUIRES_REVIEW`.
Snapshot asli tidak diubah. Tidak menebak perbaikan desimal.

`enLabel` hanya diisi bila terjemahan ada dalam indeks sumber; sisanya null,
UI perlu fallback ke `idLabel`. `mealType` katalog reference null: bahan tidak
ditetapkan sebagai sarapan/siang/malam. `mealType` log tetap wajib dipilih user.
Semua harga reference null karena sumber bukan survei harga. Demo masih punya
harga ilustrasi dan label demo, tidak diklaim harga pasar.

## API dan integrasi mobile

```http
GET /api/v1/catalog/meals?q=tempe&foodGroup=legumes&limit=50&offset=0
GET /api/v1/catalog/meals?q=AP001
GET /api/v1/catalog/meals?foodKind=single&includeDemo=false
```

Publik, read-only, no-store. Hanya pangan aktif; default reference saja.
Filter opsional: `q` (nama Indonesia/Inggris/kode; literal, case-insensitive),
`foodGroup`, `foodKind`, `includeDemo=true|false`.
Pagination default limit50/offset0, maksimum limit100/offset100000.
Parameter asing, duplikat dan nilai tidak sah menghasilkan 400.

Respons mempertahankan `catalogVersion`, `meals`, `warning`, dan menambah
`total`, `hasMore`, `nextOffset`, `warnings`. Urutan stabil nama lalu ID.
Mobile harus melanjutkan dengan `nextOffset`, bukan menganggap halaman
pertama adalah seluruh katalog. Ambil ulang dari offset0 bila versi berubah
antarhalaman. `includeDemo=true` hanya untuk pilihan demo/kompatibilitas.

Catat melalui `/sync/push`, `entityType: meal_entry`, `catalogId: tkpi-ap001`.
Untuk nasi yang **ditimbang 150 g BDD**, gunakan `servings: 1.5` (1 =100 g):
270 kcal, protein4.5 g, karbohidrat59.7 g, lemak0.45 g, serat0.3 g, natrium1.5 mg.
Bukan asumsi 1 piring=100 g atau 100 ml=100 g. Persen BDD sumber hanya informasi
bagian terbuang; API sudah memakai berat bagian dapat dimakan, jangan dikalikan
BDD dua kali. Kondisi mentah/rebus/goreng ada di nama; pilih kondisi yang benar.

Server mengambil nutrisi/provenance dari database dan mengabaikan pemalsuan
nama, harga, nutrisi atau sumber dari client. Snapshot log menyimpan
makro/natrium per porsi dan total terhitung, porsi gram serta provenance pada
saat pencatatan. Edit porsi/catatan mempertahankan sumber historis walaupun
katalog kemudian berubah. Custom meal boleh menyertakan makro/natrium nullable;
tetap `user_reported`. Mikronutrien tambahan tetap referensi **per100g** dalam
sourceDetails, belum menjadi total/target harian.

Rekap `/meals` dan target `/nutrition/targets` tetap **kalori/protein**.
Reference ikut progress; demo tidak. Belum ada target makro lain, rekomendasi
meal plan, keamanan alergi, sertifikasi halal, atau pengenalan makanan lewat foto.

## Reproduksi dan pengujian

Ekstraksi memakai PyMuPDF1.28.2 (`lines_strict` mengabaikan kotak warna sebagai
garis tabel), memastikan 21 kolom dan seluruh kode tiap halaman terambil,
menormalisasi angka terbungkus baris, serta mempertahankan penanda biru.
Tabel representatif juga dibandingkan dengan pdfplumber dan gambar halaman.
Tidak menggunakan OCR/LLM untuk mengarang angka. File PDF asli diunduh ke
direktori sementara, tidak ikut disalin ke repository.

```bash
# Read-only: emit a compact source snapshot; verify its pinned PDF hash first.
python scripts/extract-tkpi.py /path/to/tkpi-2017.pdf --compact
# Read-only: emit exactly the INSERT portion already in migration0014.
npx tsx scripts/build-tkpi-migration.ts
npm run test:food-catalog
npm run db:test-schema
npm run db:migrate
npm run db:test-food-catalog
npm run db:test-nutrition
```

Tes memeriksa reproduksi SQL persis, semua1.145 baris/nutrien/metadata yang
tersimpan, constraint sumber, null vs nol, penanda imputasi, outlier,
pagination/filter, logging150g, pemalsuan client, retry dan snapshot sync.
Migrasi dicatat Drizzle sehingga menjalankannya ulang tidak menduplikasi data;
URL+kode sumber juga unik. Perubahan dataset berikutnya memakai migrasi baru,
tidak mengedit migrasi yang sudah diterapkan.
