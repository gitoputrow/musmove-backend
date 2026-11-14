# Places: katalog Jakarta dan kontrak mobile

Panduan endpoint GET places dan brand gym untuk integrasi client tersedia di
[API Places dan Brand Gym](api-places.md).

Katalog nyata ada di `place_catalog`, bukan array demo Flutter. Migrasi
`0008_jakarta_places.sql` menambahkan katalog awal 18 lokasi dengan ID stabil.
Migrasi `0034_complete_jakarta_chain_places` memperluasnya menjadi **95 lokasi
aktif**: 36 FIT HUB, 24 FTL, 30 Anytime Fitness, 2 gym lokal, dan 3 outdoor.
Migrasi `0035_fitness_first_jakarta` menambahkan sembilan cabang Fitness First
yang diminta pemilik, sehingga katalog berisi 104 tempat. Migrasi `0036_musclebound_epfc`
menambahkan Musclebound EPFC sebagai gym konvensional: total saat ini **105 tempat**.
Daftar brand diperiksa kembali dari direktori resmi pada 14 November 2026;
ini **bukan verifikasi di lapangan**. Cakupan adalah DKI Jakarta, bukan seluruh
Jabodetabek. PIK 2 Osaka di Kabupaten Tangerang tidak dimasukkan.

Migrasi `0009_simplify_place_attributes.sql` menghapus `accessEvidence`,
`accessNote`, `locationNote`, dan `equipment` dari tabel serta response API.
Data 18 tempat, koordinat, aturan akses dan favorit tetap dipertahankan.
Nilai seed sebelum penghapusan tersedia pada migrasi historis 0008.

Migrasi `0010_remove_place_coordinate_scope.sql` juga menghapus
`coordinateScope` dari tabel serta response API. Latitude, longitude,
perhitungan jarak, filter wilayah, dan favorit tidak berubah. Version record
serta catalogVersion meningkat agar client memperbarui cache.

## Pemisahan kategori dan akses

- `mode`: `gym` atau `calisthenics` (mencakup outdoor fitness).
- `gymCategory`: `brand`, `conventional`, atau `null` untuk taman.
- `brand`: key `fithub`, `ftl`, `anytime_fitness`, atau `fitness_first`; `null` untuk gym lokal dan taman.
- `accessModel`: `membership`, `per_visit`, `membership_or_per_visit`, `public`, `unknown`.
  `membership` berarti penawaran utama yang ditemukan adalah membership,
  **bukan** bukti bahwa semua day pass/trial dilarang.
- `dayPassAvailable`: `true`, `false`, atau `null`. `null` berarti belum diketahui.
  Trial gratis tidak otomatis dihitung sebagai day pass reguler berbayar.

Gym konvensional tetap dapat menawarkan membership bulanan sekaligus per-visit.
Gym brand juga dapat memiliki day pass; kategori brand tidak menentukan akses.
Harga dan fasilitas gym tidak diisi dengan perkiraan. Jam operasional tersedia pada `openingHours`.

## Jam operasional

Migrasi `0033_place_opening_hours_json` mengubah `openingHours` dari string
menjadi array objek `{labelID, labelEN, hours}`, atau `null` jika belum diketahui.
Kolom database memakai `jsonb`. Kedua endpoint places mengembalikan bentuk sama.

FIT HUB (36 cabang):

```json
{
  "openingHours": [
    {
      "labelID": "Senin - Jumat",
      "labelEN": "Monday - Friday",
      "hours": "05.00 - 00.00"
    },
    {
      "labelID": "Sabtu, Minggu dan Libur Nasional",
      "labelEN": "Saturday, Sunday and Public Holidays",
      "hours": "06.00 - 21.00"
    }
  ]
}
```

FTL (24 cabang) dan Anytime Fitness (30 cabang):

```json
{
  "openingHours": [
    { "labelID": "Setiap Hari", "labelEN": "All Day", "hours": "24 jam" }
  ]
}
```

Lima tempat lain tetap `openingHours: null`. Array selalu berisi minimal satu
objek; tiap objek wajib memiliki tepat tiga field string nonkosong tersebut.
Urutan array dipertahankan. `hours` adalah teks tampilan, dengan jam dalam WIB
(Asia/Jakarta); `labelID` dan `labelEN` dipilih sesuai bahasa frontend.
`00.00` berarti tengah malam di akhir hari operasional. Aturan libur nasional
FIT HUB berlaku juga bila hari libur jatuh pada Senin–Jumat. Ini bukan
kalkulasi status buka sekarang.

Jam berasal dari instruksi pemilik proyek; `checkedAt` untuk sumber web lama
tetap dipertahankan. Migrasi mengonversi jam yang sudah tersimpan, mempertahankan
nilai null, dan menolak teks tak dikenal agar data tambahan tidak hilang.
Versi 13 cabang terkait, `updatedAt`, dan `catalogVersion` diperbarui untuk
refresh cache. ID, alamat, akses, koordinat, dan favorit tetap dipertahankan.
Terapkan migrasi sebelum deploy API yang menggunakan tipe baru; frontend harus
membaca array objek.

Status 14 November 2026: migrasi `0033` sudah diterapkan pada database terhubung
dan respons source API telah diverifikasi berisi array objek. Deployment API
live tetap memerlukan redeploy source terbaru.

## Fitness First: jam dari tabel pemilik

Berkas [fitness-first-jakarta-2026-11-14.json](../src/db/data/fitness-first-jakarta-2026-11-14.json)
menyimpan sembilan cabang, alamat resmi, pin venue yang ditautkan operator,
dan tiga objek `openingHours` per cabang. Jam mengikuti gambar yang diberikan
pemilik, walaupun sebagian jam website operator berbeda. Semua jam WIB.

| Cabang | Senin–Jumat | Sabtu | Minggu / Libur Nasional |
| --- | --- | --- | --- |
| Grand Indonesia | 06.00 - 22.30 | 06.00 - 21.30 | 08.00 - 20.00 |
| Senayan City | 06.00 - 22.00 | 06.00 - 21.30 | 08.00 - 20.00 |
| Pacific Place | 06.00 - 22.30 | 06.00 - 21.30 | 08.00 - 20.00 |
| Mall Taman Anggrek | 06.00 - 22.00 | 06.00 - 21.30 | 08.00 - 20.00 |
| Pejaten Village | 06.00 - 22.30 | 06.00 - 21.30 | 08.00 - 20.00 |
| Lotte Mall Jakarta | 06.00 - 22.00 | 06.00 - 21.00 | 08.00 - 20.00 |
| Kemang Village | 06.00 - 21.00 | 06.00 - 21.00 | 08.00 - 20.00 |
| St. Moritz | 06.00 - 22.00 | 06.00 - 21.00 | 08.00 - 20.00 |
| Oakwood Mega Kuningan | 06.00 - 22.00 | 07.00 - 21.00 | Tutup |

Objek berurutan memakai label berikut:

```json
[
  { "labelID": "Senin - Jumat", "labelEN": "Monday - Friday", "hours": "06.00 - 22.00" },
  { "labelID": "Sabtu", "labelEN": "Saturday", "hours": "07.00 - 21.00" },
  { "labelID": "Minggu / Libur Nasional", "labelEN": "Sunday / Public Holidays", "hours": "Tutup" }
]
```

Status 14 November 2026: migrasi `0035` sudah diterapkan pada database
terhubung. Source API mengembalikan sembilan Fitness First dan total 104 tempat.
Deployment API live tetap terpisah dari migrasi database.

Contoh tersebut adalah Oakwood. `Tutup` merupakan nilai teks yang valid untuk
`hours`; jangan mengubahnya menjadi 00.00–00.00 atau 24 jam. Libur nasional
memakai jadwal kelompok terakhir, termasuk bila jatuh pada hari kerja.

`node node_modules/tsx/dist/cli.mjs scripts/build-fitness-first-migration.ts`
menghasilkan ulang migrasi `0035` secara offline. Lotte Mall Jakarta memakai
URL operator `lotte-shopping-avenue`; tidak dibuat sebagai dua tempat berbeda.
Kota administratif Senayan City dinormalisasi ke Jakarta Pusat dan Oakwood ke
Jakarta Selatan; label kota pada alamat sumber tidak selalu konsisten.
Sumber alamat/peta: [direktori resmi Fitness First](https://www.fitnessfirst.com/id/en/clubs)
dan halaman sembilan cabang yang tersimpan dalam `sources`.

## Musclebound EPFC

Migrasi `0036_musclebound_epfc` menambahkan data yang diberikan pemilik:

- ID `jakarta-musclebound-epfc`, nama `Musclebound EPFC`.
- `mode: gym`, `gymCategory: conventional`, `brand: null`.
- Input `accessType: both` dipetakan ke `accessModel: membership_or_per_visit`
  dan `dayPassAvailable: true`, sesuai kontrak API yang sudah ada.
- Alamat: Jl. Raya Bekasi Timur KM.19 No.30, Jatinegara Kaum, Pulo Gadung,
  Jakarta Timur, DKI Jakarta 13930, Indonesia.
- Koordinat: `-6.1877521, 106.9057324`.
- CID Google Maps `13462237417293359381` dipertahankan pada
  `https://www.google.com/maps/?cid=13462237417293359381`; URL asli dari pemilik
  juga tersimpan di `sources`. URL dengan CID tidak memiliki parameter `query`.
- `openingHours`: Senin–Jumat `06.00 - 23.30`, Sabtu–Minggu `06.00 - 21.00`,
  memakai dua objek `labelID`/`labelEN`/`hours`. Jadwal libur nasional belum diberikan.

Status 14 November 2026: migrasi `0036` sudah diterapkan pada database terhubung.
Data tersebut berasal dari pemilik, bukan klaim verifikasi ulang isi Google Maps.
Filter `gymCategory=conventional&dayPassAvailable=true` kini mencakup tiga gym lokal.

## Isi seed dan sumber

| Kelompok | Lokasi | Akses yang ditemukan |
| --- | --- | --- |
| FIT HUB (36) | Cabang DKI pada direktori resmi FIT HUB; 26 tambahan dari katalog awal | Membership; day pass belum dikonfirmasi |
| FTL (24) | Cabang berlabel FTL yang beroperasi di lima kota administratif Jakarta; 21 tambahan | Membership; day pass belum dikonfirmasi |
| Anytime Fitness (30) | Cabang berstatus Open pada direktori global, dicocokkan dengan daftar resmi AF Indonesia | Membership; akses member 24 jam |
| Fitness First (9) | Grand Indonesia, Senayan City, Pacific Place, Mall Taman Anggrek, Pejaten Village, Lotte Mall Jakarta, Kemang Village, St. Moritz, Oakwood Mega Kuningan | Membership; jam persis dari tabel pemilik |
| Gym lokal (3) | New Friendly Gym Lubang Buaya; HM Fitness Jakarta / H&M Fitness Center Ulujami; Musclebound EPFC | Membership dan per-visit |
| Outdoor (3) | Tebet Eco Park Outdoor Fitness; GBK Gate VII; GBK Monkey Bar | Data lama tetap dipertahankan |

Status 14 November 2026: migrasi `0034` sudah diterapkan pada database
terhubung. Source API membaca 95 tempat; deployment kode API live tetap
terpisah dari penerapan migrasi.

Data terkurasi, ID sumber, jumlah per brand, dan pengecualian berada di
[`jakarta-chain-places-2026-11-14.json`](../src/db/data/jakarta-chain-places-2026-11-14.json).
`node node_modules/tsx/dist/cli.mjs scripts/build-jakarta-places-migration.ts`
menghasilkan ulang SQL secara offline dari berkas tersebut.

Migrasi mempertahankan 13 ID brand lama dan seluruh favorit pengguna,
memperbarui metadata 13 cabang itu, dan menambah 77 cabang baru. Lima gym
lokal/outdoor tidak diubah. Presale FTL Senayan Park, Artha Gading, Grand
Cakung serta AF Kalibata City dan Lippo Icon Cibubur belum dimasukkan sebagai
lokasi beroperasi. Cabang Stride merupakan brand terpisah dan di luar cakupan
permintaan ini; bukan digabungkan ke brand `ftl`. Rincian pengecualian ada di
berkas data, termasuk Osaka PIK 2 di luar DKI.

API tetap berhalaman: default 50, maksimum 100. Dengan katalog **105 tempat**,
frontend wajib mengikuti `hasMore`/`nextOffset`, termasuk saat memakai `limit=100`
(halaman pertama 100, halaman kedua 5). Filter dapat memakai
`brand=anytime_fitness` atau `brand=fitness_first`.

Sumber pembaruan:

- FIT HUB: [direktori Jakarta](https://fithub.id/location/jakarta), alamat dan
  koordinat yang dipublikasikan, serta halaman masing-masing cabang. Tanda
  baca berlebih pada nilai koordinat Plaza Oleos dinormalisasi saat kurasi.
- FTL: [direktori resmi](https://ftlgym.com/outlet/) dan data locator publik
  pada `clubs.ftlgym.com`. Status presale diperiksa terpisah. Koordinat venue
  memakai pin Google Maps yang ditautkan operator, bukan pusat viewport.
  Titik placeholder bersama untuk Tomang/Kebon Sirih diperbaiki memakai pin
  cabang masing-masing. Permata Hijau memakai koordinat terbitan operator.
- Anytime Fitness: [daftar cabang resmi Indonesia](https://linktr.ee/afindonesia)
  serta [direktori global resmi](https://www.anytimefitness.co.jp/map_world-test/)
  yang menyajikan data identitas, alamat, koordinat, status dan URL cabang.
  Label administratif sumber tidak selalu tepat: Setiabudi One tercatat pada
  prefektur Bali, tetapi alamat fisiknya Jakarta Selatan; Sedayu City berada
  di Cakung, Jakarta Timur. Kota dinormalisasi dari alamat fisik, bukan label
  pemasaran regional. Nama Rampstar Slipi/Kelapa Gading diperbarui menjadi
  Rosthen Garden Slipi/Mall of Indonesia sesuai daftar AF Indonesia.

Koordinat adalah data terbitan operator/direktori resmi, bukan hasil survei
lapangan. Jam buka mempertahankan instruksi pemilik proyek: FIT HUB memakai
dua jadwal, FTL dan Anytime Fitness memakai entri `Setiap Hari`/`All Day`/
`24 jam`. Jam 24 jam Anytime Fitness adalah akses member, bukan jam staf.

Sumber rinci juga tersimpan per baris dalam `sources`, beserta `kind` dan
`fields` yang didukung (`identity`, `location`, `access`):

- [FIT HUB — lokasi Jakarta](https://fithub.id/location/jakarta): data alamat
  dan koordinat dari JSON halaman resmi; penawaran membership di situs resmi.
- FTL: [Tebet](https://ftlgym.com/outlet/tebet),
  [Rawamangun](https://ftlgym.com/outlet/rawamangun),
  [Gandaria](https://ftlgym.com/outlet/gandaria), dan
  [penawaran membership](https://ftlgym.com/). Koordinat diambil dari **pin
  venue** pada peta Google Maps yang ditautkan halaman resmi, bukan pusat
  viewport iframe yang bisa bergeser beberapa ratus meter.
- [Mommies Daily — gym dengan opsi harian](https://mommiesdaily.com/2026/10/01/ini-dia-rekomendasi-gym-dengan-harga-ramah-di-kantong-bisa-bayar-harian-cocok-untuk-pelajar-maupun-lansia)
  mendukung akses dua gym lokal, bukan konfirmasi langsung pengelola.
  Pin New Friendly berasal dari
  [direktori CariBisnis](https://caribisnis.id/gym-fitness/jakarta-timur/cipayung/new-friendly-gym-cipa-imp1);
  informasi fasilitas/harga generik direktori tidak diimpor. Pin HM berasal dari
  [Waze H&M Fitness Center](https://www.waze.com/live-map/directions/id/daerah-khusus-ibukota-jakarta/handm-fitness-center?to=place.ChIJl3_80ePwaS4R9-FmMcATP-M),
  dengan alamat dan kontak yang cocok dengan laporan media.
- Tebet Eco Park: [informasi pengelola](https://tebetecopark.jakarta.go.id/v144/t101/informasi)
  dan [aktivitas outdoor fitness](https://tebetecopark.jakarta.go.id/v144/t101/aktivitas).
  Koordinat adalah pin **taman**, bukan posisi alat tertentu. Tidak diasumsikan
  ada pull-up bar/dip bar. Informasi alat tidak lagi menjadi atribut katalog.
- GBK: direktori komunitas HowToCalisthenics untuk
  [Gate VII / low bars](https://howtocalisthenics.com/en/spots/jakarta-calisthenics-gym-gate-vii-gelora-bung-karno-indonesia-spot-1/)
  dan [Monkey Bar](https://howtocalisthenics.com/en/spots/jakarta-monkey-bar-jalan-lingkar-stadion-indonesia-spot-1/).
  Pin adalah spot latihan; alat dan akses belum dikonfirmasi pengelola GBK.
  Biaya masuk, penutupan acara, dan kondisi alat perlu dicek sebelum datang.

`latitude` / `longitude` disimpan sebagai numeric(10,7), bukan jaminan
ketelitian GPS atau verifikasi di lapangan. Cakupan pin dijelaskan dalam
catatan sumber di dokumentasi ini, bukan atribut response API.
`area` adalah wilayah luas seperti Jakarta; `city` adalah kota administratif
seperti Jakarta Selatan. `area` saat ini dipakai oleh filter query API.
`checkedAt` adalah tanggal pengecekan sumber; `updatedAt` adalah waktu perubahan
record database. Tidak ada klaim buka 24 jam untuk semua taman.

`googleMapsUrl` disimpan sebagai universal Maps URL dengan koordinat dan
`api=1`. [Format resmi Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
dapat membuka aplikasi Maps atau browser, tanpa API key. Tautan koordinat
tidak menjamin profil bisnis Google tersedia.

## Daftar brand gym

`GET /api/v1/catalog/places/brands` adalah endpoint publik, tanpa Bearer token,
query parameter, atau pagination. Hasil berasal dari baris katalog aktif
`mode=gym` dan `gymCategory=brand`, bukan dari daftar brand statis.

```json
{
  "catalogVersion": "1",
  "brands": [
    { "id": "anytime_fitness", "name": "Anytime Fitness", "placeCount": 30 },
    { "id": "fithub", "name": "FIT HUB", "placeCount": 36 },
    { "id": "fitness_first", "name": "Fitness First", "placeCount": 9 },
    { "id": "ftl", "name": "FTL", "placeCount": 24 }
  ],
  "total": 4
}
```

`catalogVersion` pada contoh hanya ilustrasi. `total` menghitung brand unik;
`placeCount` menghitung cabang aktif untuk brand tersebut. ID dinormalisasi
menjadi lowercase tanpa spasi tepi dan urutan hasil berdasarkan ID. Nama brand
baru yang belum memiliki pemetaan tampilan menggunakan ID sebagai nama.
Gym konvensional seperti Musclebound EPFC dan tempat outdoor tidak masuk.
Jika tidak ada brand aktif, respons tetap 200 dengan `brands: []` dan `total: 0`.

Gunakan `brands[].id` untuk filter `/catalog/places?brand=...` atau
`/places?brand=...`. Jangan menurunkan daftar brand dari satu halaman places.
State katalog dan jumlah cabang dibaca pada snapshot database yang sama;
header keamanan, pembatasan request publik, dan `Cache-Control: no-store`
mengikuti endpoint katalog lainnya. `OPTIONS` tersedia; query tidak dikenal
atau berulang ditolak 400. Tidak ada migrasi database yang diperlukan.

## API

Public: `GET /api/v1/catalog/places`.
Private: `GET /api/v1/places`, Bearer Neon Auth, menambahkan `isFavorite` milik
akun yang terverifikasi. Tidak menerima `userId` dari client.

Parameter kedua endpoint sama:

| Parameter | Fungsi |
| --- | --- |
| `area`, `city` | Filter persis, case-insensitive; area awal `Jakarta`, city misalnya `Jakarta Selatan` |
| `mode`, `gymCategory`, `brand` | Mode, kategori gym dan brand key; brand case-insensitive |
| `accessModel` | Filter model akses persis; bukan filter semua tempat yang bisa per-visit |
| `dayPassAvailable=true` | Semua gym dengan opsi per-visit yang dilaporkan; null tidak cocok dengan false |
| `latitude`, `longitude` | Koordinat user harus diberikan berpasangan; opsional |
| `radiusKm` | Maksimal 100 km, memerlukan koordinat user |
| `limit`, `offset` | Default 50 / 0; limit 1–100, offset 0–100000 |

Contoh:

```http
GET /api/v1/catalog/places?area=Jakarta&mode=gym&gymCategory=conventional&dayPassAvailable=true
GET /api/v1/catalog/places?mode=gym&gymCategory=brand&brand=ftl
GET /api/v1/catalog/places?brand=fitness_first
GET /api/v1/catalog/places?mode=calisthenics
GET /api/v1/places?latitude=-6.226542&longitude=106.8546583&radiusKm=5&limit=10
Authorization: Bearer <access-token>
```

Response: `catalogVersion`, `places`, `total`, `hasMore`, `nextOffset`,
`distanceType`, `warnings`. Record mencakup ID/nama, kategori/akses, lokasi,
sumber, tanggal, `openingHours`, `version` sebagai string, dan `distanceKm`.

Jika koordinat user diberikan, jarak dihitung dengan Haversine dan hasil
diurutkan berdasarkan jarak, nama, ID. Radius difilter **sebelum pagination**;
`total` menghitung semua hasil filter. Jarak dibulatkan ke 0.001 km dan merupakan
garis lurus, **bukan jarak jalan/waktu perjalanan**. Tanpa koordinat,
`distanceKm` dan `distanceType` null, urutan nama/ID, tidak memakai angka demo.
Koordinat user hanya dipakai untuk request tersebut; tidak disimpan. Response
no-store karena dapat mengandung lokasi user dan favorit privat.

Parameter salah, ganda, tidak dikenal, atau konflik seperti
`mode=calisthenics&gymCategory=brand` menghasilkan 400 `VALIDATION_ERROR`.

## Favorit dan versioning

Favorit tetap memakai sync `place_favorite`, bukan perubahan katalog:

```json
{
  "schemaVersion": 1,
  "deviceId": "mobile-installation-id",
  "operations": [{
    "operationId": "<uuid>",
    "action": "upsert",
    "entityType": "place_favorite",
    "entityId": "jakarta-ftl-tebet",
    "baseVersion": "0",
    "payload": {}
  }]
}
```

Client baru harus memakai ID yang dikembalikan katalog. Favorit lama seperti
`Jakarta-0` berasal dari data fiktif mobile: tetap dipertahankan dalam sync,
tidak diubah menjadi gym nyata yang tidak terkait dan tidak menciptakan tempat
baru di katalog. Favorit akun lain/tombstone tidak ditampilkan sebagai favorit.

Insert/update/delete katalog meningkatkan `catalog_state.places`; update juga
meningkatkan version record dan updatedAt. Katalog tidak masuk change log user.
Mobile perlu fetch katalog dan memperbarui cache lokal berdasarkan versi.
Migrasi memakai ID stabil; pembaruan 0034 menyegarkan metadata katalog brand
yang sudah ada tanpa mengganti ID atau favorit.

Flutter masih menggunakan katalog demo sampai layer data mobile dihubungkan
ke endpoint ini; perubahan backend tidak otomatis mengganti UI mobile.

## Pengujian

`test:places`: validasi filter, boolean, koordinat, radius/pagination dan rumus
jarak. `db:test-schema`: seluruh migrasi pada PostgreSQL lokal PGlite, jumlah
seed, constraint kategori/akses/koordinat/sumber dan trigger versi.
`db:test-places`: DB Neon nyata, katalog/semua filter, jarak SQL vs Haversine,
radius sebelum pagination, endpoint public/error/auth, favorit terisolasi dan
tombstone. Test membuat dua akun sintetis dan menghapusnya di finally, tidak
mengubah lokasi atau data user yang sudah ada.
