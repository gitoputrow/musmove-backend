# Follow-up frontend lengkap: seluruh perubahan API backend

Tanggal: 20 Oktober 2026. Mengikuti `backend-online-mode-follow-up.md` dari mobile.
Implementasi **source lokal** selesai; bukan klaim sudah deploy. Tidak ada migrasi
database/dependensi/env baru, penghapusan storage lama, atau write akun production.

**Kirim dokumen ini sebagai follow-up utama ke frontend.** Isinya seluruh
perubahan yang dikerjakan: startup/setup/skip, profil dan preferensi gabungan,
program custom/jadwal, exercise buatan, workout, jurnal/nutrisi, favorit tempat,
draft/publikasi sosial, dashboard/statistik, penghapusan akun, serta aturan
versi/retry dan rollout. Revisi workout terbaru sudah termasuk: **hanya simpan
setelah selesai**, bukan start/resume atau simpan progres ke backend.

Dokumen workout terpisah hanya penjelasan tambahan, **tidak perlu dikirim sebagai
pengganti dokumen lengkap ini**. Penjelasan integrasi seluruh fitur ada di bawah.

Ringkasan perubahan mobile:

- Startup memakai auth yang ada dan satu GET /me, bukan meta/bootstrap/pull rutin.
- Skip tidak menulis apa pun; setupCompleted tetap false sampai finalisasi.
- Editor menyimpan field berubah dalam satu request dan memakai respons kanonis.
- Repository fitur baru memakai endpoint resource langsung, tidak sync/push.
- Workout mengirim seluruh hasil hanya saat Selesai; progres hanya di memori.
- Histori/data lama, guard akun dan sync versi lama tetap dipertahankan.

## 1. Matriks endpoint

Semua path berikut memakai prefix `/api/v1` dan Bearer JWT, kecuali katalog publik.
Path `{id}` adalah ID resource, bukan ID akun. Ownership selalu dari JWT.

| Fitur | Endpoint langsung pada source sekarang |
| --- | --- |
| Identitas/setup/profil/preferensi | `GET /me`, **`PATCH /me`** gabungan |
| Finalisasi onboarding pertama | `POST /onboarding/complete` tetap dipertahankan |
| Program custom/jadwal | `GET/POST /programs/custom`; `GET/PATCH/DELETE /programs/custom/{id}` |
| Exercise buatan akun | `GET/POST /exercises/custom`; `GET/PATCH/DELETE /exercises/custom/{id}` |
| Workout selesai / catatan manual | `POST /workouts` satu kali setelah selesai; seluruh hasil set dikirim sekaligus |
| Histori workout | `GET /workouts`; `GET/DELETE /workouts/{id}`; tidak ada start/resume atau simpan progres |
| Jurnal makan | `GET/POST /meals`; `GET/PATCH/DELETE /meals/{id}` |
| Favorit tempat | `GET /places`; `PUT/DELETE /places/{id}/favorite` |
| Draft sosial privat | `GET/POST /social/drafts`; `GET/PATCH/DELETE /social/drafts/{id}` |
| Dashboard/jadwal/statistik | `GET /dashboard?date=YYYY-MM-DD`; `GET /schedule?from=...&to=...`; `GET /statistics?from=...&to=...` |
| Publikasi/feed/hapus/laporan sosial | Endpoint lama `/social/posts` dan `/social/reports` tetap; publikasi harus eksplisit dan feature flag berlaku |
| Penghapusan akun | `GET/POST /account/deletion-requests` tetap, masa tunggu 7 hari dan guard inactive tetap |

Sebelumnya sebagian besar write hanya tersedia melalui sync. Route baru memakai
tabel, validator, guard akun dan stream yang sama; **sync lama tidak dihapus**.
Mobile baru tidak perlu bootstrap/pull atau membungkus write baru dengan sync.
Jangan mengirim mutasi yang sama melalui kedua protokol.

Kontrak mesin: [openapi.yaml](openapi.yaml) merujuk path/schema di
[openapi-online.json](openapi-online.json). Simpan kedua file berdampingan untuk
resolver OpenAPI/codegen. JSON dihasilkan dari DTO melalui
`scripts/export-online-openapi.ts` dan diperiksa tes agar tidak tertinggal.

## 2. Aturan umum write

```http
Authorization: Bearer <access-JWT>
Content-Type: application/json
Idempotency-Key: <UUID baru untuk satu aksi final>
```

- Semua mutasi resource baru, termasuk DELETE, membutuhkan key tersebut. DELETE memakai
  JSON `{ "baseVersion": "..." }`, bukan versi di query parameter.
- Create program/exercise/jurnal/draft: `{ "id": "<ID stabil buatan client>", "data": { ... } }` → HTTP 201.
  Gunakan UUID untuk ID baru; karakter yang diterima adalah huruf/angka, `_`,
  `.`, `:`, `-`, panjang 1–255, diawali huruf/angka. ID tidak bisa diganti/dipakai
  ulang setelah dihapus. POST workout, onboarding complete, dan PATCH /me memakai
  body khusus di bagian masing-masing, bukan envelope create tersebut.
- Patch resource: `{ "baseVersion": "1", "changes": { ...field berubah } }` →
  HTTP 200 `{ "item": { ...state lengkap, "version": "2", "updatedAt": "..." } }`.
  Patch kosong/field asing ditolak. Omission mempertahankan nilai; nullable null
  menghapus nilai; array yang dikirim mengganti array lama.
- Versi adalah **string desimal** 0..9223372036854775807, bukan JSON number.
  Update/delete memerlukan versi dari respons baca/write terakhir.
- Setiap aksi tersimpan atomik bersama perubahan stream, kenaikan versi dan
  receipt. Kegagalan rollback seluruh transaksi, termasuk receipt.
- Retry selama proses masih hidup: **key dan body sama** mengembalikan respons
  sukses awal, bukan melakukan write lagi. Key untuk isi/path/aksi berbeda →
  `409 IDEMPOTENCY_KEY_REUSE`. Receipt terikat akun, mengikuti lifecycle/retensi
  receipt yang sudah ada; tidak ada TTL cleanup baru atau endpoint discovery.
- Hasil replay adalah hasil awal, bukan state paling baru bila ada edit lain.
  Refresh normal saat konflik/dibutuhkan, bukan refetch otomatis setelah sukses.
- Batas JSON 64 KiB/depth 32; mutation response 256 KiB; read response 3 MiB.
  Limit akun 120 request/menit, mutasi umum 30/menit; limit sosial lama tetap.
- Semua DELETE adalah soft-delete dengan tombstone dan versi baru. Respons
  `{ "id": "...", "deleted": true, "version": "2" }` (favorit berbeda di bawah).
  Retry key lama sukses; aksi DELETE baru pada resource yang sudah hilang →404.

Aturan resource baru di atas tidak mengganti kontrak auth, publikasi/laporan
sosial, atau penghapusan akun yang sudah tersedia. Endpoint lama tersebut tetap
memakai body/idempotensi masing-masing, dijelaskan pada bagian 8.

## 3. Startup dan skip

Restore sesi/token mengikuti proxy auth yang sudah ada, lalu **GET `/me` satu
kali**. Respons sekarang juga mencakup `userPreferences` (budget/area, nullable)
dan `versions.userPreferences`, selain profil dan preferensi latihan yang lama:

```json
{
  "user": { "id": "00000000-0000-4000-8000-000000000001", "email": null, "status": "active" },
  "setupCompleted": false,
  "profile": null,
  "trainingPreferences": null,
  "userPreferences": null,
  "versions": { "profile": "0", "trainingPreferences": "0", "userPreferences": "0" }
}
```

Urutan startup:

1. Tanpa sesi secure storage: Welcome/Login, tanpa request data akun.
2. Dengan sesi: restore menggunakan `/auth/get-session` dan ambil JWT melalui
   `/auth/token` sesuai kontrak auth yang sudah ada. Credential `Session` hanya
   untuk auth; data privat memakai `Bearer <JWT>`, bukan sessionToken.
3. GET /me satu kali; error jaringan/401/403 bukan bukti profil kosong atau izin
   membuka akun offline.
4. Ambil data halaman yang diperlukan setelah routing. Gabungkan request sama
   yang sedang berjalan; request independen boleh paralel, tidak semua fitur
   dimuat pada startup.
5. Logout/pergantian akun membersihkan state privat di memori dan mengabaikan
   respons yang berasal dari generasi sesi sebelumnya.

Skip hanya navigasi ke dashboard terbatas: **tanpa mutasi/flag/tabel skip**.
`setupCompleted: false` tidak membedakan belum pernah setup dengan pernah skip.
Mobile tidak meminta recommendations/targets saat false, dan membersihkan hasil
personal lama di memori. Tidak ada guard `SETUP_REQUIRED` baru untuk kedua route.
`/dashboard` mengembalikan nutritionTargets/remaining null jika belum setup,
tanpa membuat profil/program/target palsu.

Wizard hanya di memori sampai `POST /onboarding/complete` berhasil. Tidak ada
draft/resumeStep atau penyimpanan setiap langkah. Onboarding tetap menerima
baseVersions profil/latihan; key `userPreferences` dari `/me` boleh ikut terkirim
namun **tidak dicek/ditulis** oleh complete. Respons complete juga mengembalikan
preferensi budget/area dan versinya yang sedang tersimpan. Tidak mengubah status
akun lama yang sudah complete berdasarkan kelengkapan nutrisi opsional.

Sesi secure storage, bahasa dan tema tetap boleh disimpan lokal. Tidak ada cache
domain disk, timer sync/outbox baru, fallback akun offline, atau recovery khusus.
Data/outbox lama belum terkirim **tidak dihapus** oleh perubahan backend ini.

### Submit onboarding pertama

POST `/onboarding/complete`, Bearer JWT dan Idempotency-Key UUID. Contoh akun
baru; untuk akun yang sudah memiliki data, gunakan versi dari /me:

```json
{
  "baseVersions": { "profile": "0", "trainingPreferences": "0" },
  "profile": {
    "ageYears": 25, "goal": "bulk", "dailyActivity": "light",
    "trainingFrequency": 3, "sessionMinutes": 45,
    "programSource": "app", "focus": "full",
    "motivationEnabled": true, "motivationReason": "health",
    "weightKg": 70, "heightCm": 175, "formulaSex": "male",
    "gender": "prefer_not_to_say"
  },
  "trainingPreferences": {
    "mode": "gym", "equipment": ["dumbbell", "bench"], "noEquipment": false
  }
}
```

Backend menyimpan profil/preferensi latihan dan menandai setupCompleted true
dalam satu transaksi. Jangan kirim setupCompleted sendiri. Respons HTTP 200
berisi operationId, setupCompleted, profile, trainingPreferences, userPreferences,
versions dan nutritionTargets. Gunakan respons langsung, jangan submit jawaban
yang sama lagi melalui sync/push.

Core final wajib: ageYears 1–150, goal bulk/cut/maintenance (maintain diterima
sebagai alias), dailyActivity light/moderate/vigorous, frekuensi 1–7, durasi
10–180 menit, programSource app/custom, motivationEnabled boolean dan
motivationReason nonkosong <=80 karakter. Source app wajib satu focus
full/leg/chest/back/arm; source custom boleh focus null/tidak dikirim.
Berat, tinggi, formulaSex, gender dan konteks/kemampuan tambahan bersifat
opsional; tidak dikarang jika pengguna belum memberikannya. No equipment harus
eksplisit dengan noEquipment true dan array alat kosong.

Complete bukan editor: key baru setelah sudah complete →409
ONBOARDING_ALREADY_COMPLETED. Retry key/body sukses yang sama mengembalikan
hasil awal. Konflik versi → baca /me dan tinjau perubahan, jangan menimpa diam-diam.

### Rekomendasi dan kebutuhan nutrisi

Ketika setupCompleted false, mobile tidak meminta GET /programs/recommendations
atau GET /nutrition/targets. Widget menampilkan ajakan Lengkapi setup, bukan
program demo, hasil personal lama atau angka nol buatan.

Setelah complete, ambil rekomendasi saat fitur memerlukannya. Program tetap
mengikuti mode/alat/fokus/durasi, data/kemampuan pengguna dan guard domain yang
sudah ada; bisa tidak ada program cocok. nutritionTargets sudah ada pada respons
complete/PATCH /me, jadi tidak perlu langsung GET lagi. Formula goal bulk/cut/
maintenance serta guard usia/kesehatan tetap berjalan di backend; mobile tidak
menambahkan surplus/defisit kedua kali. Setup true tidak menjamin estimasi siap:
jika input nutrisi belum memadai, tampilkan status belum tersedia, bukan null
sebagai nol. Pembatasan request sebelum setup adalah tanggung jawab mobile,
bukan endpoint SETUP_REQUIRED baru.

## 4. Editor profil dan preferensi: satu PATCH

Gunakan data `/me` di memori saat membuka editor. Mengetik, batal, atau Simpan
tanpa perubahan tidak memerlukan request. Contoh saat benar-benar berubah:

```http
PATCH /api/v1/me
```

```json
{
  "baseVersions": { "profile": "1", "trainingPreferences": "1", "userPreferences": "0" },
  "profile": { "weightKg": 72, "trainingContext": { "recoveryStatus": "tired" } },
  "trainingPreferences": { "equipment": ["dumbbell", "bench"], "noEquipment": false },
  "userPreferences": { "budgetIsManual": true, "budgetRupiah": 50000, "placesArea": "Jakarta Selatan" }
}
```

Hanya sertakan base version **persis untuk resource yang berubah**. Jika hanya
berat berubah, kirim profile dan baseVersions.profile saja. Data profil,
preferensi latihan dan budget/area yang dikirim disimpan satu transaksi. Alat
divalidasi setelah merge, harus aktif dan mendukung mode; duplikasi ditolak.
`noEquipment` harus konsisten dengan array alat. Manual budget memerlukan angka
positif; budget rupiah adalah preferensi pengguna, bukan jaminan biaya aktual.

Respons HTTP 200:

```json
{
  "setupCompleted": true,
  "profile": { "weightKg": 72, "version": "2", "updatedAt": "2026-10-20T00:00:00.000Z" },
  "trainingPreferences": { "mode": "gym", "equipment": ["dumbbell", "bench"], "noEquipment": false, "version": "2", "updatedAt": "2026-10-20T00:00:00.000Z" },
  "userPreferences": { "budgetIsManual": true, "budgetRupiah": 50000, "placesArea": "Jakarta Selatan", "version": "1", "updatedAt": "2026-10-20T00:00:00.000Z" },
  "versions": { "profile": "2", "trainingPreferences": "2", "userPreferences": "1" },
  "nutritionTargets": { "profileVersion": "2", "estimate": null }
}
```

Contoh di atas **dipotong**: respons nyata menyertakan seluruh field profil dan
kontrak nutritionTargets lengkap, bukan selalu estimate null. Profile update
menyimpan snapshot nutrisi untuk versi profil baru. Jika hanya preferences yang
berubah, versi profil dan snapshot nutrisi tidak ikut dinaikkan. Target yang
belum siap tetap nullable sesuai formula/guard usia/kesehatan yang sudah ada.

`trainingContext` merge per kunci; null menghapus seluruh konteks. Gender,
formulaSex, kemampuan, exclusions, metadata dan boolean tidak diedit tetap
dipertahankan. Gender tidak mengarang formulaSex/kemampuan. `setupCompleted`
server-owned, **ditolak** dalam body patch; tidak diturunkan menjadi false.
Editor profil/latihan berlaku setelah finalisasi pertama (`ONBOARDING_NOT_COMPLETED`
jika belum); budget/area boleh disimpan independen tanpa menyimpan draft wizard.

## 5. Program custom dan exercise

Create exercise: `POST /exercises/custom` dengan `id` dan data
`{mode, name, defaultSets, defaultReps}`. Mode `gym`/`calisthenics`, sets 1–10,
reps 1–100. Mode/ID exercise stabil; mode tidak bisa diganti setelah dibuat.
ID katalog tidak boleh dibayangi ID exercise buatan.

Contoh POST `/exercises/custom` (HTTP 201 → `{item}`):

```json
{
  "id": "exercise-uuid",
  "data": { "mode": "gym", "name": "Latihan saya", "defaultSets": 2, "defaultReps": 8 }
}
```

Contoh PATCH `/exercises/custom/exercise-uuid`:

```json
{ "baseVersion": "1", "changes": { "name": "Nama baru", "defaultReps": 10 } }
```

DELETE resource memakai `{ "baseVersion": "<versi terakhir>" }` serta key baru.

Simpan program bersama exercise baru yang dibutuhkan, dalam **satu transaksi**:

```json
{
  "id": "program-uuid",
  "data": {
    "mode": "gym", "name": "Program saya", "durationMinutes": 30, "weekday": 2,
    "exercisePrescriptions": [
      { "id": "exercise-uuid", "idLabel": "Latihan saya", "enLabel": "My exercise", "requirements": [[]], "sets": 2, "reps": 8, "targetWeightKg": null }
    ]
  },
  "newExercises": [
    { "id": "exercise-uuid", "data": { "mode": "gym", "name": "Latihan saya", "defaultSets": 2, "defaultReps": 8 } }
  ]
}
```

POST `/programs/custom` → `{item, exercises}`. PATCH program menerima
`{baseVersion, changes, newExercises?}` dan mengembalikan exercise baru juga.
Jika memakai newExercises saat update, sertakan exercisePrescriptions baru.
Gagal salah satu validasi/slot jadwal → semuanya rollback, tidak menyisakan
exercise yatim akibat transaksi gagal.

Durasi 10–180 menit, 1–12 prescription unik, weekday ISO Senin=1..Minggu=7 atau
null (tidak dijadwalkan). Satu slot per akun/mode/weekday; bentrok →409.
Exercise harus dari katalog aktif atau akun sendiri, dengan mode cocok.
Server mengkanonisasi label/requirements, bukan percaya provenance client;
exercise buatan tidak memiliki persyaratan alat terverifikasi dan memakai `[[]]`.
Prescription sets/reps/beban tetap input pengguna, bukan rekomendasi medis.
Edit nama saja tidak menghitung ulang snapshot prescription lama dari katalog.

GET koleksi program/exercise/draft: `?limit=25&cursor=...`, maksimum 100,
respons `{items, nextCursor}`. Program/exercise boleh `mode=gym|calisthenics`.
Cursor signed, terikat akun/resource/filter; jangan dipakai lintas akun/filter.
Urutan berdasarkan ID, bukan updatedAt. Refresh list untuk melihat insert yang
urutannya sebelum cursor. GET detail mengembalikan `{item}`. Tidak perlu GET
katalog lagi setelah setiap ketikan/pilihan atau setelah sukses menyimpan.

## 6. Workout: hanya simpan setelah selesai

Kontrak final workout sudah tercakup di bagian ini; frontend tidak perlu memakai
rancangan workout dari dokumen sebelumnya atau membuka handoff terpisah.

Keputusan pengguna terbaru menggantikan rancangan start/resume sebelumnya:
**tidak ada request saat Mulai, menyelesaikan set, atau membatalkan latihan**.
Program/prescription dan progres latihan sementara hanya di memori mobile.
Backend baru menyimpan ketika pengguna menekan **Selesai latihan**.

```http
POST /api/v1/workouts
Authorization: Bearer <JWT>
Content-Type: application/json
Idempotency-Key: <UUID untuk submit hasil akhir>
```

```json
{
  "id": "workout-uuid",
  "source": "custom",
  "programId": "program-uuid",
  "mode": "gym",
  "startedAt": "2026-10-20T07:00:00+07:00",
  "finishedAt": "2026-10-20T07:30:00+07:00",
  "recordedOn": "2026-10-20",
  "exerciseSnapshot": [
    { "id": "exercise-uuid", "idLabel": "Latihan saya", "enLabel": "My exercise", "requirements": [[]], "sets": 2, "reps": 8, "targetWeightKg": null }
  ],
  "setLog": [
    { "exerciseId": "exercise-uuid", "setNumber": 1, "completed": true, "reps": 8, "weightKg": 5 },
    { "exerciseId": "exercise-uuid", "setNumber": 2, "completed": true, "reps": 7, "weightKg": 5 }
  ],
  "note": "Catatan opsional"
}
```

`source` adalah `custom`, `recommended`, atau `manual`. Custom/recommended
wajib mengirim programId dengan mode cocok: custom harus milik akun sendiri,
recommended harus ID katalog program. Untuk catatan manual, source manual dan
**hilangkan programId**. Endpoint manual terpisah tidak diperlukan.

Server menyimpan **status completed**; field status tidak boleh dikirim client.
HTTP 201 mengembalikan `{item}` lengkap dengan version `"1"`, snapshot dan
seluruh setLog. Penyimpanan row, event sync, serta receipt satu transaksi.
Retry key/body sama tidak menggandakan histori. Sukses hanya setelah ACK server.

Kirim snapshot prescription yang benar-benar digunakan dari memori mobile,
jangan mengambil ulang program/rekomendasi untuk membentuk histori setelah
latihan. Backend memvalidasi ID/mode/ownership dan label/requirements, tetapi
tidak mengganti sets/reps/beban snapshot dengan program terkini atau menghitung
ulang rekomendasi. Ini catatan user-reported, bukan bukti program pernah
direkomendasikan. Referensi katalog nonaktif atau exercise/program milik akun
yang sudah soft-deleted masih dapat menjadi rujukan historis setelah latihan.
Exercise yang tidak dikenal atau milik akun lain tetap ditolak.

1–12 prescription unik; setLog maksimum120 dan setiap kunci exerciseId/setNumber
unik serta harus merujuk prescription. `finishedAt >= startedAt`; recordedOn
adalah tanggal lokal mulai latihan (>=1900-01-01), maksimal selisih satu hari
dari UTC start day. Note tersimpan di legacyMetadata.note, source di
legacyMetadata.source. Setelah tersimpan, snapshot tidak bisa diedit/reopen;
DELETE hanya tombstone, bukan mengubah isi histori.

Endpoint `/workouts/active`, `/workouts/manual`, `/workouts/{id}/sets`,
`/workouts/{id}/complete` dan `/workouts/{id}/abort` sudah dihapus dari source
API langsung yang belum dideploy. Dashboard tidak lagi mengembalikan activeWorkout.

Jika aplikasi ditutup sebelum submit, progres memori bisa hilang. Jika pengguna
membatalkan, tidak ada workout baru yang disimpan. Jika submit timeout, pertahankan
body/key di memori untuk retry yang sama; jangan otomatis kirim dengan ID baru.
Tidak ada resume progres server, draft workout, atau recovery lintas restart.

GET histori tetap `/workouts?from=...&to=...&limit=25&cursor=...` dan detail
`GET /workouts/{id}`. Data/sync lama tidak dihapus: GET/rekap legacy masih bisa
memuat status active/aborted dari klien lama, tetapi API baru tidak menciptakannya
atau memutasi progresnya. Penyesuaian protokol legacy tidak dilakukan di sini.

## 7. Jurnal makan dan favorit

POST `/meals` memakai `{id,data}`; schema data lengkap di OpenAPI `MealEntryPayload`.
Contoh pangan katalog:

```json
{
  "id": "meal-uuid",
  "data": {
    "menuName": null, "note": null, "samplePriceRupiah": null, "snapshot": {},
    "catalogId": "tkpi-ap001", "servings": 1.5,
    "consumedAt": "2026-10-20T07:00:00+07:00", "recordedOn": "2026-10-20", "mealType": "breakfast"
  }
}
```

Pangan custom memakai catalogId null dan `nutrition` per serving; total dihitung
server. Metadata nutritionDetails server-owned; input client tidak bisa memalsukan
provenance katalog. Servings 0.01–20 (dua desimal); 1 serving TKPI =100g edible,
bukan satu piring. Harga katalog adalah **estimasi**; null tidak berarti gratis.

Create/patch mengembalikan `{item,journals:[{date,summary,targets,warnings}]}`;
delete mengembalikan `{id,deleted,version,journals}`. `reportedTotals` mencakup
seluruh hari, bukan hanya halaman. Bila tanggal diubah, ringkasan **kedua tanggal**
disertakan. Snapshot nutrisi/harga makanan yang sama dipertahankan saat edit
servings/note meskipun katalog sudah berubah/tidak aktif. Mengganti catalogId
memilih sumber baru; pindah menjadi custom perlu nutrisi eksplisit.

Read jurnal tetap `GET /meals?date=...&limit=50&offset=0` (maksimum 100) dengan
entries/summary/targets/hasMore/nextOffset; detail `{item}`. Demo tidak dihitung
sebagai progress dan entri legacy tanpa tanggal tidak masuk total hari.

GET `/places` sekarang menambah `favoriteVersion` (termasuk versi tombstone),
terpisah dari `version` katalog tempat. PUT/DELETE `/places/{id}/favorite` memakai
`{baseVersion: favoriteVersion}` → `{placeId,isFavorite,favoriteVersion}`.
Tambah memerlukan tempat aktif; hapus tempat lama tidak bergantung katalog aktif.
Hanya satu tempat yang berubah, bukan seluruh daftar; re-add memakai versi
tombstone, bukan otomatis 0. Same-state write tidak menaikkan versi.

## 8. Draft sosial, ringkasan dan error

Draft privat memakai data `{body,metadata}`: body nonkosong <=2000 karakter,
metadata JSON nullable. CRUD draft **tidak memublikasikan**. Untuk publikasi tetap
gunakan POST `/social/posts` dengan `postId`, `publish:true`, `authorLabel`, `body`,
persetujuan pengguna dan feature flag yang sudah ada. Penghapusan/report tetap
endpoint lama; tidak ada auto-publish setelah koneksi pulih.

Contoh POST `/social/drafts`:

```json
{
  "id": "draft-uuid",
  "data": { "body": "Catatan latihan yang masih privat", "metadata": null }
}
```

Respons create/patch/detail `{item}`; list `{items,nextCursor}`. PATCH memakai
baseVersion dan changes, DELETE memakai baseVersion seperti resource lain.
Draft tidak otomatis dihapus atau dipublikasikan ketika dibuat/diedit.

Kontrak komunitas yang tetap dipakai:

- GET `/social/posts?limit=20&cursor=...`: feed `{items,nextCursor}`, limit maksimal
  50; bukan daftar draft akun.
- POST `/social/posts`: body `{postId, publish:true, authorLabel, body}`. postId
  UUID dipertahankan saat retry body yang sama; HTTP 201 mengembalikan postId,
  publishedAt, duplicate. Ini kontrak idempotensi lama berbasis postId, bukan
  envelope `{id,data}` atau keharusan Idempotency-Key baru.
- DELETE `/social/posts?postId=<UUID>`: hapus posting sendiri, respons
  `{status:"deleted"}`; tidak memakai baseVersion resource baru.
- POST `/social/reports`: `{postId, reason, details?}` →HTTP 202
  `{status:"received",duplicate}`. Reason spam/harassment/unsafe_content/privacy/
  other; details nullable <=1000 karakter. Tidak melaporkan posting sendiri.
- Feed/publikasi mengikuti feature flag backend; SOCIAL_NOT_ENABLED bukan alasan
  mengarang feed sukses. Tidak ada foto, like, komentar, atau auto-publish baru.

Penghapusan akun tetap memakai POST `/account/deletion-requests` **tanpa body
dan query**, lalu GET pada path sama untuk status. HTTP 202 berarti akun
dinonaktifkan dan penghapusan dijadwalkan setelah 7 hari, bukan sudah terhapus
fisik. Guard inactive tetap menahan API privat biasa. Status deletion dapat
dibaca dengan JWT yang masih valid sesuai kontrak; tidak ada endpoint recovery
publik atau izin memperpanjang akses setelah token/provider sudah tidak valid.
Tidak ada worker deletion production yang dijalankan oleh perubahan ini.

Dashboard mengambil jadwal custom hari tersebut, workoutDays dan
rekap jurnal, tanpa mengambil seluruh histori atau memanggil rekomendasi.
Schedule mengembalikan `weeklyPrograms`, `workoutDays` serta konvensi weekday.
Statistics mengembalikan agregat SQL `workoutDays`, `mealDays`, `totals`, warnings:
completed/aborted workouts, durasi, completedSets, reportedReps,
reportedExternalVolumeKg dan setsMissingLoad. Volume hanya reps × beban eksternal
yang dilaporkan, bukan estimasi bodyweight/kekuatan atau kalori terbakar.
Rentang from<=to dengan selisih maksimal 366 hari; rekap tidak mengirim semua log.

Contoh error (ID ilustrasi):

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Data changed; refresh before saving",
    "details": { "currentVersion": "2" }
  },
  "requestId": "request-ilustrasi"
}
```

400 validasi/domain; 401 refresh JWT terbatas; 403 inactive jangan loop refresh;
404 resource tidak ada/bukan milik akun; 409 stale version/key/slot jadwal
conflict; 413 ukuran; 415 MIME; 429 hormati Retry-After; 500/503 jangan dianggap
write pasti gagal. Pertahankan isian/key di memori untuk retry yang sama. Setelah
restart, baca state server lewat alur normal; tidak ada janji exactly-once atau
recovery form/key lintas restart, dan jangan otomatis resend dengan ID baru.

## 9. Verifikasi dan rollout

Uji menggunakan PGlite serta identitas/JWKS sintetis, memblokir koneksi DB/Auth
production. Cakupan: auth/ownership, isolasi akun, stale versions, duplikasi dan
cross-operation key reuse, rollback profil/nutrisi/preferences maupun program/
exercise baru, runtime grants terbatas, histori immutable, optional nutrition,
profil legacy complete, favorite tombstones, cursor binding, submit workout final-only,
serta agregat berdasarkan data akun. Ini bukan simulasi race multi-koneksi
PostgreSQL; transaksi memakai urutan lock akun/sync-state yang sama dengan sync
lama dan unique constraints untuk slot jadwal; constraint/status sesi aktif lama
tetap ada demi kompatibilitas, bukan alur start/resume baru.

Pemeriksaan Vercel read-only pada 20 Oktober 2026:

- `/api/v1/meta` masih metadata lama, tanpa capability online baru.
- GET `/api/v1/exercises/custom` →404.
- GET `/api/v1/dashboard?date=2026-10-20` →404.
- OPTIONS 204 sendiri **bukan bukti** route/domain contract sudah tersedia.

Belum deploy/push, belum uji JWT akun asli/write production. Sebelum cutover:
deploy commit ini, cek capability `atomicAccountPatch`, `onlineResourceApi`,
`completedWorkoutSubmission` pada meta secara operasional (bukan startup rutin mobile), lalu
uji baca/write dengan akun uji yang disetujui. Verifikasi runtime grants, error,
retry dan ringkasan pada deployment tujuan sebelum mengklaim siap production.
Tidak perlu DDL/env baru untuk fitur ini; jangan menjalankan migrasi lama ulang.

Mobile adalah project terpisah: belum diubah/dibuild di pekerjaan backend ini.
Transisi SQLite/outbox lama tetap membutuhkan rencana tersendiri; jangan
menghapus progres, data pending, atau hasil write yang belum diketahui.

## 10. Checklist frontend: seluruh fitur

- Auth tetap melalui proxy Next.js; jangan mengganti JWT dengan sessionToken
  pada API data, atau menganggap sesi tersimpan pasti masih valid.
- Startup satu /me; routing setup/skip berdasarkan boolean server, tanpa meta,
  bootstrap/pull rutin, draft wizard, flag skip atau default profil buatan.
- Editor memakai state yang sudah ada di memori; satu PATCH saat Simpan berubah,
  tanpa request per field dan tanpa GET otomatis setelah ACK.
- Program/exercise memakai CRUD langsung, weekday dan prescription sesuai
  kontrak; program + exercise baru dapat disimpan satu transaksi.
- Workout hanya satu submit setelah Selesai; tidak start/resume/per-set/abort
  write. Simpan isian sementara dan key hanya di memori, jangan buang hasil
  yang belum mendapat ACK hanya karena timeout.
- Jurnal memakai respons item dan journals untuk rekap hari terkait; pertahankan
  snapshot historis dan label estimasi harga, jangan menghitung ulang dari
  katalog terkini setelah makan disimpan.
- Favorit memakai favoriteVersion, bukan version katalog, dan hanya mengubah
  tempat yang dipilih; jangan mengirim seluruh daftar.
- Draft tetap privat; publikasi/laporan eksplisit mengikuti kontrak sosial lama.
- Dashboard/jadwal/statistik dimuat saat halaman membutuhkan; jangan menarik
  seluruh histori pada startup untuk menghitung rekap.
- Penghapusan akun mengikuti status server dan masa tunggu 7 hari, bukan
  hanya menghapus sesi lokal atau menampilkan sukses hapus fisik saat 202.
- Uji ownership, versi stale, retry, null/omission, rollback, data lama dan
  pergantian akun; jangan silent overwrite atau memakai respons sesi lama.
- Jangan menghapus SQLite/outbox/data legacy otomatis. Cutover Flutter, build
  aplikasi dan deploy belum dilakukan oleh pekerjaan backend ini.
- Untuk handoff manusia cukup dokumen ini. Jika memakai generator client,
  sertakan pasangan openapi.yaml dan openapi-online.json yang sudah ditautkan.
