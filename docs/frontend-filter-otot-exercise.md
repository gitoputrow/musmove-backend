# Filter exercise berdasarkan otot

Perubahan ini perlu di-deploy sebelum tersedia di API production. Filter ini
berada pada endpoint publik yang sama dengan filter alat:

## Ambil pilihan otot

```http
GET /api/v1/catalog/muscles
```

Contoh respons (daftar dipersingkat):

```json
{
  "catalogVersion": "1",
  "groups": [
    {
      "id": "upper_body",
      "idLabel": "Tubuh atas",
      "enLabel": "Upper Body",
      "muscles": [
        { "id": "chest", "idLabel": "Dada", "enLabel": "Chest" },
        { "id": "biceps", "idLabel": "Bisep", "enLabel": "Biceps" }
      ]
    },
    {
      "id": "lower_body",
      "idLabel": "Tubuh bawah",
      "enLabel": "Lower Body",
      "muscles": [
        { "id": "quadriceps", "idLabel": "Paha depan", "enLabel": "Quadriceps" }
      ]
    }
  ]
}
```

Setiap item punya ID stabil dan label Indonesia/Inggris. `catalogVersion` di
endpoint ini adalah versi daftar pilihan otot, terpisah dari versi katalog
exercise. Data ini saat ini berasal dari source backend, bukan tabel database.
Respons belum menyediakan gambar atau URL gambar; ilustrasi seperti contoh
perlu disediakan frontend sebagai aset yang dipetakan ke ID otot.

## Filter exercise

```http
GET /api/v1/catalog/exercises?bodyPart=upper_body
GET /api/v1/catalog/exercises?bodyPart=lower_body
GET /api/v1/catalog/exercises?bodyPart=upper_body&muscle=chest
GET /api/v1/catalog/exercises?bodyPart=lower_body&muscle=quadriceps
GET /api/v1/catalog/exercises?muscles=chest,quadriceps
GET /api/v1/catalog/exercises?bodyPart=upper_body&muscles=chest,triceps
GET /api/v1/catalog/exercises?muscle=chest&equipment=dumbbell&mode=gym
GET /api/v1/catalog/exercises?muscle=triceps&muscleRole=any
```

Tanpa `bodyPart` dan `muscle`, perilaku katalog tetap sama seperti sebelumnya.
Field respons tetap `catalogVersion` dan `exercises`. Filter otot, alat, ID alat,
dan mode digabung dengan AND. Query tidak dikenal, duplikat, nilai tidak valid,
atau kombinasi `bodyPart` dan `muscle` yang tidak cocok menghasilkan HTTP 400.

## Pilihan untuk UI

| Kelompok | Otot: nilai parameter `muscle` |
| --- | --- |
| Upper body | `chest`, `shoulders`, `biceps`, `triceps`, `forearms`, `abs`, `obliques`, `upperBack`, `lats`, `lowerBack` |
| Lower body | `glutes`, `quadriceps`, `hamstrings`, `calves` |

Kelompok ini adalah pembagian untuk UI. Otot core (`abs`, `obliques`,
`lowerBack`) ditempatkan di upper body agar semua 14 area yang saat ini ada
di katalog memiliki tempat; ini tidak bermakna bahwa core adalah otot lengan.
Nilai parameter bersifat case-sensitive. Frontend dapat menggunakan label yang
lebih ramah pengguna tanpa mengubah nilai yang dikirim.

`bodyPart` sendiri menampilkan semua exercise yang cocok dengan salah satu
otot dalam kelompok itu. `muscle` memilih satu otot; `muscles` memilih satu
atau beberapa ID dipisahkan koma, tanpa spasi atau duplikat. Untuk beberapa
otot, hasilnya **OR**: exercise muncul jika cocok dengan minimal satu otot
yang dipilih, bukan harus semuanya. Jangan kirim `muscle` dan `muscles`
bersamaan. Pilihan lintas upper/lower diperbolehkan dengan `muscles` tanpa
`bodyPart`; jika `bodyPart` dikirim, semua pilihan harus berada dalam kelompok
tersebut. Exercise muncul sekali sekalipun cocok dengan beberapa pilihan.

Contoh gambar juga memuat Neck, Traps, Abductors dan Adductors. Keempatnya
belum menjadi ID terpisah pada data `muscleTargets` saat ini, sehingga tidak
dikembalikan sebagai pilihan filter. Khusus traps mungkin tercakup dalam
`upperBack` dan abductors pada `glutes`, tetapi bukan padanan satu-ke-satu;
jangan memberi label seolah cakupannya sudah spesifik.

## Otot utama dan pendukung

Secara default filter memakai `muscleTargets.primary` agar hasil mewakili
otot yang menjadi sasaran utama. Parameter opsional `muscleRole` mengubah
pilihan tersebut:

- `primary` — hanya otot utama; default.
- `secondary` — hanya otot pendukung.
- `any` — otot utama atau pendukung.

Contoh: bench press dapat muncul saat `muscle=triceps&muscleRole=any` apabila
triceps tercatat sebagai otot pendukung, tetapi tidak harus muncul dalam filter
triceps default. Exercise tanpa `muscleTargets` tidak muncul saat filter otot
aktif; tanpa filter otot exercise itu tetap muncul. Data ini adalah klasifikasi
katalog, bukan pengukuran aktivasi otot user.

`catalogVersion` adalah versi seluruh katalog, bukan versi spesifik filter.
Cache respons berdasarkan seluruh query, bukan versi saja. Filter ini hanya
berlaku untuk exercise katalog publik; exercise custom user perlu ditangani
terpisah. Tidak ada perubahan UI mobile dalam pekerjaan backend ini.
