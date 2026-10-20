# Follow-up frontend: setup final melalui API

Tanggal: 20 Oktober 2026. Implementasi source; perlu redeploy backend sebelum
dipakai pada URL production. Tidak ada migrasi database baru untuk fitur ini.

## Alur mobile

1. Login melalui proxy auth Next.js, ambil JWT dari `GET /api/v1/auth/token`.
2. Panggil `GET /api/v1/me` dengan `Authorization: Bearer <JWT>`.
3. Jika `setupCompleted: false`, tampilkan setup. Jawaban sementara hanya di
   memori mobile; tidak dikirim per langkah. Jika aplikasi ditutup sebelum
   submit berhasil, setup diulang dari awal. Jangan menghapus data lokal akun
   lama/outbox secara otomatis saat beralih ke alur ini.
4. Saat seluruh jawaban siap, panggil `POST /api/v1/onboarding/complete` sekali
   dengan seluruh data final, `baseVersions` dari `/me`, dan UUID baru pada
   header `Idempotency-Key`. Backend yang menetapkan `setupCompleted: true`.
5. Gunakan respons kanonis untuk state mobile. Ambil rekomendasi program saat
   dibutuhkan; `nutritionTargets` sudah disertakan sehingga tidak perlu langsung
   meminta `/nutrition/targets` lagi.
6. Saat buka aplikasi berikutnya, `/me` menentukan routing: belum setup atau
   sudah setup. Tidak ada `resumeStep`, `in_progress`, draft, atau progress setup.

`/me` tetap mengembalikan objek `user` lama dan menambah field berikut. Contoh
akun baru (nilai `user` tetap ada, tidak ditampilkan pada potongan ini):

```json
{
  "setupCompleted": false,
  "profile": null,
  "trainingPreferences": null,
  "versions": { "profile": "0", "trainingPreferences": "0" }
}
```

Profil/preferensi yang sudah ada dikembalikan beserta `version` berupa string
dan `updatedAt` ISO. `/me` tidak membuat profil/draft atau menulis estimasi
nutrisi. Status akun lama **tidak** dihitung ulang dari kelengkapan field:
`setupCompleted` yang sudah true tidak direset karena field opsional kosong.
Versi tombstone tetap dikembalikan di `versions` meskipun objeknya null.

## Submit final

```http
POST /api/v1/onboarding/complete
Authorization: Bearer <JWT>
Content-Type: application/json
Idempotency-Key: 3779c027-8238-4e8e-b687-8886484b72a2
```

```json
{
  "baseVersions": { "profile": "0", "trainingPreferences": "0" },
  "profile": {
    "displayName": "Pengguna Contoh",
    "ageYears": 25,
    "goal": "bulk",
    "dailyActivity": "light",
    "trainingFrequency": 3,
    "sessionMinutes": 45,
    "programSource": "app",
    "focus": "full",
    "motivationEnabled": true,
    "motivationReason": "health",
    "weightKg": 70,
    "heightCm": 175,
    "formulaSex": "male",
    "gender": "prefer_not_to_say",
    "trainingLevel": "beginner"
  },
  "trainingPreferences": {
    "mode": "gym",
    "equipment": ["dumbbell", "bench"],
    "noEquipment": false
  }
}
```

Jangan kirim `userId`, `setupCompleted`, token, field progress, atau query
parameter. Objek request strict; batas JSON 64 KiB. Semua versi wajib string
desimal 0..9223372036854775807, bukan angka JSON. Nilai `0` hanya jika belum ada
row, bukan default yang dikirim untuk semua akun.

Field final wajib di `profile`:

| Field | Nilai |
| --- | --- |
| `ageYears` | Bilangan bulat 1–150; program/nutrisi tetap mengikuti guard usia yang sudah ada |
| `goal` | `bulk`, `cut`, `maintenance`; alias mobile `maintain` disimpan sebagai `maintenance` |
| `dailyActivity` | `light`, `moderate`, `vigorous` |
| `trainingFrequency` | Bilangan bulat 1–7, termasuk data lama 7 hari |
| `sessionMinutes` | Bilangan bulat 10–180 |
| `programSource` | `app` atau `custom` |
| `focus` | Wajib satu dari `full`, `leg`, `chest`, `back`, `arm` untuk `app`; untuk `custom` boleh tidak dikirim/null |
| `motivationEnabled` | Boolean eksplisit |
| `motivationReason` | String nonkosong maksimum 80 karakter, termasuk jika pengingat dimatikan |

`trainingPreferences` wajib berisi `mode`, `equipment`, `noEquipment`.
Gunakan ID unik dari katalog, maksimal 50, aktif dan `modes`-nya mendukung mode
pilihan. `noEquipment: true` memerlukan `equipment: []`; false memerlukan alat
minimal satu. Tanpa alat boleh untuk kedua mode; bukan jaminan selalu ada
program yang cocok. Pemilihan `custom` tidak otomatis membuat custom program.

Field profil opsional: `displayName`, `weightKg`, `heightCm`, `formulaSex`,
`gender`, `trainingLevel`, `trainingContext`, `exerciseCapabilities`, dan
`excludedExerciseIds`. Kontrak lengkap/batas nilainya ada di
[OpenAPI](openapi.yaml), schema `OnboardingProfile`.

Field opsional yang tidak dikirim mempertahankan nilai lama. `null` eksplisit
menghapus nilai nullable; objek `trainingContext` menggabungkan kunci yang
dikirim dengan konteks lama, sedangkan null menghapus konteks seluruhnya.
Array yang dikirim mengganti array lama. Jangan menebak gender, formulaSex,
status kesehatan, atau kemampuan olahraga; `gender` tidak otomatis menentukan
`formulaSex`, kekuatan, atau beban latihan.

## Penyimpanan dan respons

Satu transaksi menyimpan `profiles` dan `training_preferences`, menaikkan versi
keduanya, menetapkan `profiles.setup_completed = true`, menyimpan snapshot
`nutrition_estimates` sesuai versi profil, mencatat dua perubahan legacy sync,
dan menyimpan receipt idempotensi. Jika salah satu gagal, semuanya rollback.
Tidak ada tabel draft/progress baru.

HTTP 200 berisi `operationId`, `setupCompleted: true`, `profile`,
`trainingPreferences`, `versions`, serta `nutritionTargets` dengan kontrak yang
sama seperti `GET /nutrition/targets`. Pada akun baru versi menjadi `"1"` untuk
kedua entitas. Profil mengembalikan seluruh field kanonis, termasuk null;
`userId` dan metadata tombstone tidak diekspos pada objek profil.

Kalori/protein memakai formula/guard yang sudah ada dan goal bulk/cut/maintenance.
Jika berat, tinggi, atau formulaSex belum tersedia, setup tetap bisa selesai,
tetapi estimasi nutrisi belum siap. Jangan menampilkan null sebagai nol, atau
menghitung ulang surplus/defisit di mobile. Usia/health guard tetap berlaku.

## Retry dan error

- Timeout/putus koneksi: retry dengan **UUID dan body yang sama persis**. Respons
  pertama disimpan atomik; retry tidak menambah versi, stream, atau snapshot.
  Receipt terikat akun dan mengikuti retensi lifecycle akun yang sudah ada;
  belum ada TTL/cleanup baru. Respons replay adalah hasil awal, bukan jaminan
  state terbaru setelah edit berikutnya; baca `/me` untuk state terkini.
- Setelah restart tanpa body/key di memori, baca `/me` dahulu. Jika true,
  langsung masuk aplikasi; jika false, ulangi setup dan buat UUID baru saat siap.
- `409 VERSION_CONFLICT`: jangan menimpa state otomatis. Baca `/me`; jika sudah
  selesai, gunakan data server. Jika belum, tinjau perubahan dan kirim final baru
  dengan versi terkini dan UUID baru. Detail error menyertakan `currentVersions`.
- `409 ONBOARDING_ALREADY_COMPLETED`: baca `/me`; endpoint ini bukan edit profil.
- `409 IDEMPOTENCY_KEY_REUSE`: key sudah dipakai untuk body berbeda atau operasi
  sync lain. Jangan gunakan ulang key untuk aksi berbeda.
- `400 VALIDATION_ERROR` / `EQUIPMENT_NOT_AVAILABLE_FOR_MODE`: perbaiki input;
  server belum menyimpan setup. Refresh katalog bila alat sudah tidak tersedia.
- `401`: perbarui JWT satu kali sesuai alur auth; `403 ACCOUNT_INACTIVE`: jangan
  loop refresh. `429`: hormati `Retry-After`. `500/503`: retry dengan body/key
  sama setelah jeda; jangan menganggap status setup telah tersimpan.

## Kompatibilitas dan cakupan

API sync lama tetap tersedia. Dua event dari onboarding dapat dibaca klien lama
melalui pull; mekanisme lock, versi, dan ownership tetap sama. Jangan mengirim
setup final yang sama lagi melalui `/sync/push` setelah berhasil memakai endpoint
baru. Endpoint ini tidak memerlukan bootstrap/pull untuk menyimpan setup.

Perubahan ini hanya mencakup `/me` dan finalisasi onboarding. Seluruh CRUD online
dalam proposal frontend belum otomatis diimplementasikan oleh perubahan ini.
Tidak ada perubahan kebijakan email verification atau scan foto.
