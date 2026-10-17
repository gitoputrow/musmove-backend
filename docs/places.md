# Places: katalog Jakarta dan kontrak mobile

Katalog nyata ada di `place_catalog`, bukan array demo Flutter. Migrasi
`0008_jakarta_places.sql` menambahkan 18 lokasi dengan ID stabil. Pengecekan
sumber web dilakukan 11 Oktober 2026, **bukan verifikasi di lapangan**.
Katalog awal belum mencakup seluruh Jakarta dan tidak memasukkan Jabodetabek
di luar DKI, misalnya cabang PIK 2 di Kabupaten Tangerang.

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
- `brand`: key `fithub` / `ftl`; `null` untuk gym lokal dan taman.
- `accessModel`: `membership`, `per_visit`, `membership_or_per_visit`, `public`, `unknown`.
  `membership` berarti penawaran utama yang ditemukan adalah membership,
  **bukan** bukti bahwa semua day pass/trial dilarang.
- `dayPassAvailable`: `true`, `false`, atau `null`. `null` berarti belum diketahui.
  Trial gratis tidak otomatis dihitung sebagai day pass reguler berbayar.

Gym konvensional tetap dapat menawarkan membership bulanan sekaligus per-visit.
Gym brand juga dapat memiliki day pass; kategori brand tidak menentukan akses.
Harga, jam operasional, dan fasilitas gym tidak diisi dengan perkiraan.

## Isi seed dan sumber

| Kelompok | Lokasi | Akses yang ditemukan |
| --- | --- | --- |
| FIT HUB (10) | Benhil, Sunter Altira, Tebet, Fatmawati, Grogol, Mampang, Pluit, Puri Indah, Rawamangun, Salemba | Membership; day pass belum diketahui |
| FTL (3) | Tebet, Rawamangun, Gandaria | Membership; day pass belum diketahui |
| Gym lokal (2) | New Friendly Gym Lubang Buaya; HM Fitness Jakarta / H&M Fitness Center Ulujami | Bulanan dan per-visit menurut media; konfirmasi ulang |
| Outdoor (3) | Tebet Eco Park Outdoor Fitness; GBK Gate VII; GBK Jalan Lingkar Stadion Monkey Bar | Taman publik; akses GBK berdasarkan laporan komunitas |

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
GET /api/v1/catalog/places?mode=calisthenics
GET /api/v1/places?latitude=-6.226542&longitude=106.8546583&radiusKm=5&limit=10
Authorization: Bearer <access-token>
```

Response: `catalogVersion`, `places`, `total`, `hasMore`, `nextOffset`,
`distanceType`, `warnings`. Record mencakup ID/nama, kategori/akses, lokasi,
sumber, tanggal, `version` sebagai string, dan `distanceKm`.

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
Migrasi memiliki seed ID stabil dan tidak menimpa record yang sudah ada.

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
