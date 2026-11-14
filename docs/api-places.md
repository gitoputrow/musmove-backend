# API Places dan Brand Gym

Panduan integrasi untuk mengambil daftar tempat latihan, memfilter gym, dan
mengambil pilihan brand gym. Semua path memakai prefix `/api/v1`.

| Method | Endpoint | Autentikasi | Kegunaan |
| --- | --- | --- | --- |
| GET | `/api/v1/catalog/places` | Publik | Daftar tempat latihan dengan filter dan pagination |
| GET | `/api/v1/places` | Bearer JWT | Daftar tempat yang sama, ditambah status favorit akun |
| GET | `/api/v1/catalog/places/brands` | Publik | Daftar brand gym unik beserta jumlah cabang aktif |

Ketiga endpoint mendukung `OPTIONS`. Respons JSON memakai
`Cache-Control: private, no-store` dan menyertakan header `X-Request-ID`.

## Autentikasi

Endpoint publik tidak membutuhkan token. Untuk `/api/v1/places`, gunakan access
token JWT dari `GET /api/v1/auth/token`:

```http
Authorization: Bearer <access-token>
```

Identitas akun ditentukan dari token. Jangan mengirim `userId` sebagai parameter.
Alur memperoleh token dijelaskan di [panduan autentikasi](frontend-follow-up-auth-proxy.md).

## GET daftar places

```http
GET /api/v1/catalog/places?limit=20&offset=0
```

Versi dengan favorit akun:

```http
GET /api/v1/places?limit=20&offset=0
Authorization: Bearer <access-token>
```

Kedua endpoint memakai parameter dan pagination yang sama. Hanya tempat aktif
yang dikembalikan. Semua parameter opsional; beberapa filter digabung dengan AND.

### Query parameter

| Parameter | Tipe / nilai | Default | Keterangan |
| --- | --- | --- | --- |
| `area` | String, 1–120 karakter | — | Nama wilayah, misalnya `Jakarta`; cocok persis tanpa membedakan huruf besar/kecil |
| `city` | String, 1–120 karakter | — | Misalnya `Jakarta Timur`; cocok persis tanpa membedakan huruf besar/kecil |
| `mode` | `gym`, `calisthenics` | — | Jenis tempat latihan |
| `gymCategory` | `brand`, `conventional` | — | Gym jaringan atau gym nonbrand |
| `brand` | String, 1–80 karakter | — | Gunakan `brands[].id` dari endpoint brand; pencocokan tidak membedakan huruf besar/kecil |
| `accessModel` | `membership`, `per_visit`, `membership_or_per_visit`, `public`, `unknown` | — | Filter nilai model akses secara persis |
| `dayPassAvailable` | `true`, `false` | — | Filter ketersediaan akses per kunjungan; nilai `null` tidak cocok dengan keduanya |
| `latitude` | Angka desimal, −90 hingga 90 | — | Latitude posisi pengguna; wajib bersama `longitude` |
| `longitude` | Angka desimal, −180 hingga 180 | — | Longitude posisi pengguna; wajib bersama `latitude` |
| `radiusKm` | Angka desimal, > 0 hingga 100 | — | Radius dalam km; memerlukan kedua koordinat |
| `limit` | Bilangan bulat, 1–100 | `50` | Maksimal data per request |
| `offset` | Bilangan bulat, 0–100000 | `0` | Jumlah data yang dilewati |

String filter di-trim. Parameter tidak dikenal, parameter berulang, nilai tidak
valid, atau `mode=calisthenics` bersama `gymCategory` / `brand` ditolak dengan 400.
Gunakan nilai boolean literal `true` / `false`, bukan `1` / `0`.

Contoh filter:

```http
GET /api/v1/catalog/places?mode=gym&gymCategory=brand&brand=fithub&limit=20&offset=0
GET /api/v1/catalog/places?brand=fitness_first
GET /api/v1/catalog/places?mode=gym&gymCategory=conventional
GET /api/v1/catalog/places?mode=calisthenics
GET /api/v1/catalog/places?city=Jakarta%20Timur&dayPassAvailable=true
GET /api/v1/catalog/places?latitude=-6.1877521&longitude=106.9057324&radiusKm=5&limit=10
```

`accessModel=per_visit` hanya memilih model tersebut. Untuk mencari semua tempat
yang menyediakan opsi per kunjungan, termasuk `membership_or_per_visit`, gunakan
`dayPassAvailable=true`.

### Bentuk respons places

Contoh ilustratif untuk request
`/api/v1/catalog/places?mode=gym&gymCategory=conventional&limit=1&offset=0`.
Versi, waktu pembaruan, jumlah data, dan isi katalog dapat berubah.

```json
{
  "catalogVersion": "11",
  "places": [
    {
      "id": "jakarta-musclebound-epfc",
      "name": "Musclebound EPFC",
      "mode": "gym",
      "gymCategory": "conventional",
      "brand": null,
      "accessModel": "membership_or_per_visit",
      "dayPassAvailable": true,
      "openingHours": [
        {
          "labelID": "Senin - Jumat",
          "labelEN": "Monday - Friday",
          "hours": "06.00 - 23.30"
        },
        {
          "labelID": "Sabtu - Minggu",
          "labelEN": "Saturday - Sunday",
          "hours": "06.00 - 21.00"
        }
      ],
      "area": "Jakarta",
      "city": "Jakarta Timur",
      "address": "Jl. Raya Bekasi Timur KM.19 No.30, Jatinegara Kaum, Pulo Gadung, Jakarta Timur, DKI Jakarta 13930, Indonesia",
      "latitude": -6.1877521,
      "longitude": 106.9057324,
      "googleMapsUrl": "https://www.google.com/maps/?cid=13462237417293359381",
      "sources": [
        {
          "url": "https://maps.google.com/?cid=13462237417293359381",
          "kind": "map",
          "fields": ["identity", "location"]
        }
      ],
      "checkedAt": "2026-11-14",
      "active": true,
      "version": "1",
      "updatedAt": "2026-11-14T00:00:00.000Z",
      "distanceKm": null
    }
  ],
  "total": 3,
  "hasMore": true,
  "nextOffset": 1,
  "distanceType": null,
  "warnings": [
    "WEB_RESEARCH_NOT_ON_SITE_VERIFICATION",
    "CONFIRM_ACCESS_BEFORE_VISITING",
    "NULL_DAY_PASS_MEANS_UNKNOWN_NOT_UNAVAILABLE"
  ]
}
```

Contoh di atas menunjukkan bentuk satu item; pemilihan item sebenarnya mengikuti
aturan pengurutan di bawah.

| Field respons | Keterangan |
| --- | --- |
| `catalogVersion` | Versi katalog global dalam string desimal |
| `places` | Array tempat pada halaman ini |
| `total` | Jumlah seluruh tempat yang cocok dengan filter, sebelum pagination |
| `hasMore` | `true` jika masih ada hasil berikutnya |
| `nextOffset` | Offset request berikutnya; `null` jika sudah habis |
| `distanceType` | `"straight_line"` jika koordinat diberikan; selain itu `null` |
| `warnings` | Kode informasi terkait sumber dan kepastian data |

Field setiap tempat:

| Field | Tipe / arti |
| --- | --- |
| `id`, `name` | String ID stabil dan nama tempat |
| `mode` | `gym` atau `calisthenics` |
| `gymCategory` | `brand`, `conventional`, atau `null` untuk calisthenics |
| `brand` | ID brand, atau `null` untuk gym nonbrand / calisthenics |
| `accessModel` | Salah satu nilai model akses pada tabel parameter |
| `dayPassAvailable` | Boolean atau `null` jika belum diketahui; `null` tidak berarti tidak tersedia |
| `openingHours` | Array objek `{labelID, labelEN, hours}`, atau `null` jika belum diketahui |
| `area`, `city`, `address` | String wilayah, kota, dan alamat |
| `latitude`, `longitude` | Koordinat numerik tempat |
| `googleMapsUrl` | URL Google Maps yang bisa dibuka langsung; dapat memakai koordinat atau CID |
| `sources` | Array sumber: `url`, `kind` (`operator`, `publisher`, `map`, `community`), dan `fields` (`identity`, `location`, `access`) |
| `checkedAt` | Tanggal pengecekan sumber, format `YYYY-MM-DD` |
| `active` | `true` untuk hasil kedua endpoint GET ini |
| `version` | Versi record tempat, string desimal |
| `updatedAt` | Waktu pembaruan record dalam ISO 8601 |
| `distanceKm` | Jarak garis lurus dalam km, dibulatkan hingga 0.001 km; `null` tanpa koordinat pengguna |
| `isFavorite` | Boolean; hanya ada pada endpoint privat `/places` |
| `favoriteVersion` | String desimal versi favorit, termasuk versi tombstone; `"0"` jika belum ada record favorit. Hanya ada pada endpoint privat |

Pada endpoint privat, setiap item juga memiliki field seperti berikut:

```json
{
  "isFavorite": false,
  "favoriteVersion": "0"
}
```

Field versi dikirim sebagai string; pertahankan format ini di client.
`catalogVersion` digunakan untuk mendeteksi perubahan katalog, bukan sebagai
cursor pagination. Respons publik tidak menyertakan kedua field favorit.

### Pagination

Ambil halaman pertama dengan `offset=0`, lalu gunakan `nextOffset` dari respons
untuk halaman berikutnya. Pertahankan `limit` dan seluruh filter selama berpindah halaman.

```http
GET /api/v1/catalog/places?brand=fithub&limit=20&offset=0
GET /api/v1/catalog/places?brand=fithub&limit=20&offset=20
```

Berhenti ketika `hasMore=false` dan `nextOffset=null`. Hasil kosong tetap 200
dengan `places: []`. Jika filter tidak menemukan data, `total=0`; jika offset
sudah melewati hasil, `total` tetap menunjukkan jumlah seluruh hasil filter.

Pagination memakai offset, bukan parameter `page` atau cursor. Jika katalog
berubah di antara request halaman, posisi hasil dapat bergeser; client dapat
memuat ulang dari offset 0 ketika `catalogVersion` berubah.

### Jarak dan pengurutan

Tanpa koordinat pengguna, hasil diurutkan menurut nama lalu ID;
`distanceKm` dan `distanceType` bernilai `null`.

Dengan kedua koordinat, hasil diurutkan menurut jarak, nama, lalu ID.
`radiusKm` difilter sebelum pagination dan penghitungan `total`.
Jarak memakai Haversine (garis lurus), bukan jarak jalan atau waktu perjalanan.
Koordinat pengguna hanya dipakai untuk request tersebut dan tidak disimpan.

### Jam operasional

`openingHours` berbentuk JSON array objek, bukan string JSON. `labelID` dan
`labelEN` adalah label tampilan; `hours` adalah string jam operasional.
Contoh FIT HUB:

```json
[
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
```

Contoh FTL dan Anytime Fitness:

```json
[
  { "labelID": "Setiap Hari", "labelEN": "All Day", "hours": "24 jam" }
]
```

Jam untuk katalog Jakarta mengikuti WIB (`Asia/Jakarta`). `00.00` berarti
tengah malam pada akhir hari yang disebutkan. Jadwal libur nasional menggantikan
jadwal hari biasa. Nilai `hours` juga dapat berisi `"Tutup"`; nilai
`openingHours=null` berarti belum diketahui. Tampilkan array sesuai urutan dari
server. API tidak mengembalikan status buka/tutup saat ini.

## GET brand gym

```http
GET /api/v1/catalog/places/brands
```

Publik, tanpa query parameter dan tanpa pagination. Contoh respons berdasarkan
isi katalog saat dokumentasi dibuat; jumlah cabang dan versi dapat berubah:

```json
{
  "catalogVersion": "11",
  "brands": [
    { "id": "anytime_fitness", "name": "Anytime Fitness", "placeCount": 30 },
    { "id": "fithub", "name": "FIT HUB", "placeCount": 36 },
    { "id": "fitness_first", "name": "Fitness First", "placeCount": 9 },
    { "id": "ftl", "name": "FTL", "placeCount": 24 }
  ],
  "total": 4
}
```

| Field | Keterangan |
| --- | --- |
| `catalogVersion` | Versi katalog places, string desimal |
| `brands[].id` | ID brand untuk query `brand` pada kedua endpoint places |
| `brands[].name` | Nama tampilan brand |
| `brands[].placeCount` | Jumlah cabang aktif brand tersebut di seluruh katalog |
| `total` | Jumlah brand unik, bukan jumlah cabang |

Brand diambil dari tempat aktif dengan `mode=gym` dan `gymCategory=brand`.
Gym nonbrand seperti Musclebound EPFC dan tempat calisthenics tidak masuk daftar.
ID dinormalisasi menjadi lowercase tanpa spasi tepi, lalu diurutkan berdasarkan
ID. Brand baru yang belum memiliki pemetaan nama tampilan menggunakan ID sebagai
nama. Nama dan jumlah pilihan brand tidak perlu ditulis statis di client.

Jika tidak ada brand aktif, respons tetap 200 dengan `brands: []` dan `total: 0`.
Endpoint ini tidak menerima filter wilayah, `limit`, atau `offset`;
`placeCount` bukan jumlah hasil untuk filter places yang sedang dipilih client.
Versi katalog dan jumlah cabang dibaca pada snapshot database yang sama dalam
satu request; request brand dan request places terpisah dapat melihat versi berbeda.

Alur penggunaan di aplikasi:

1. Ambil `/api/v1/catalog/places/brands` untuk pilihan filter brand.
2. Tampilkan `brands[].name` dan simpan `brands[].id` sebagai nilai pilihan.
3. Saat pengguna memilih brand, ambil places dengan `brand=<id>&limit=20&offset=0`.
4. Gunakan `nextOffset` untuk memuat hasil selanjutnya. Reset offset ke 0 saat filter berubah.

## Error

| HTTP | Kode umum | Penyebab |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Parameter salah, berulang, tidak dikenal, atau kombinasi filter tidak valid |
| 401 | `UNAUTHORIZED` | Token tidak ada, tidak valid, atau kedaluwarsa pada `/places` |
| 403 | `ACCOUNT_INACTIVE` | Akun tidak aktif pada `/places` |
| 429 | `RATE_LIMITED` | Batas request terlampaui; ikuti header `Retry-After` |
| 500 | `INTERNAL_ERROR` | Kegagalan internal server |
| 503 | `RATE_LIMIT_UNAVAILABLE`, `TRUSTED_PROXY_REQUIRED` | Perlindungan request / proxy sementara tidak tersedia atau belum dikonfigurasi |

Contoh bentuk error 400 untuk parameter berulang:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Duplicate query parameter: limit"
  },
  "requestId": "example-request-id"
}
```

Sebagian error validasi juga memiliki `error.details`. Gunakan `error.code`
untuk penanganan di client dan `requestId` untuk penelusuran.

## Referensi

- [OpenAPI](openapi.yaml) untuk skema kontrak lengkap.
- [Katalog places](places.md) untuk sumber data, riwayat migrasi, dan versioning.
- [API online](frontend-follow-up-online-api.md) untuk operasi tambah/hapus favorit.
