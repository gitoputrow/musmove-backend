# Equipment catalog, nama alat dan scan foto

Implementasi backend menggunakan SigLIP 2 Base yang dijalankan sendiri,
bukan API AI berbayar. Tidak ada model AI lokal yang dipasang ke Flutter.
Mobile masih perlu dihubungkan ke endpoint di bawah; perubahan ini tidak
mengganti halaman scan Flutter secara otomatis.

## Database dan pencarian nama

Migrasi `0012_equipment_catalog.sql` membuat `equipment_catalog` berisi 28 alat:
27 key yang sudah digunakan 117 exercise, ditambah `mat` dari katalog mobile.
Field utama `id`, `name`, `aliases`, `modes`; `active` dan `updatedAt` untuk
pengelolaan katalog. ID memakai key lama seperti `pull_up_bar`, bukan enum
Flutter `pullUpBar`. Nama English juga menjadi label kandidat model; alias
Indonesia dan variasi ejaan membantu pencarian nama.

Nama latihan tidak disalin ke tabel alat. `exercise_catalog.requirements`
tetap menjadi sumber hubungan alat/latihan: inner array adalah AND, outer
array adalah OR. Trigger menolak referensi alat yang tidak terdaftar serta
penghapusan/rename ID alat yang masih dirujuk; nonaktifkan alat untuk menyembunyikannya.
Perubahan katalog alat meningkatkan `catalog_state.equipment`.

`GET /api/v1/catalog/equipment` (public) mengembalikan `catalogVersion`,
`matchType` dan `equipment`. Query `q` opsional, panjang 2–120 karakter.
Pencarian menormalisasi Unicode, case, spasi, underscore dan hyphen; hanya
alias lengkap menghasilkan `exact`. Hasil parsial selalu `candidates`,
bukan hasil pengenalan yang pasti. Tidak ada pencocokan typo di luar alias
yang terdaftar.

```http
GET /api/v1/catalog/equipment?q=dambel
GET /api/v1/catalog/equipment?q=bar
GET /api/v1/catalog/equipment?mode=gym
GET /api/v1/catalog/equipment?mode=calisthenics&q=bar
GET /api/v1/catalog/exercises?equipmentIds=dumbbell&mode=gym
GET /api/v1/catalog/exercises?equipmentIds=dumbbell,bench&mode=gym
```

### Jenis alat gym dan kalistenik (migrasi 0020)

Setiap alat memiliki `modes` berupa array non-kosong: `["gym"]`,
`["calisthenics"]`, atau `["gym", "calisthenics"]`. Ini kategori penggunaan
latihan, bukan lokasi alat atau bukti tersedia di setiap gym/taman.

- Gym saja (20 alat): assisted_pullup_machine, barbell, cable_machine,
  chest_press_machine, chest_supported_row_machine, decline_chest_press_machine,
  dumbbell, high_row_machine, incline_chest_press_machine, iso_lateral_row_machine,
  landmine, lat_pulldown_machine, leg_curl_machine, leg_extension_machine,
  leg_press_machine, low_row_machine, pec_deck_machine, pullover_machine,
  smith_machine, squat_rack.
- Kalistenik saja (2 alat): low_bar, rings.
- Keduanya (6 alat): bench, chair, mat, parallel_bars, pull_up_bar, resistance_band.

Chair juga muncul pada exercise mode gym yang sudah ada; tidak dikeluarkan
dari kategori gym. Jumlah hasil filter adalah 26 gym dan 8 kalistenik karena
enam alat bersama dihitung pada keduanya, bukan penambahan ID alat.

Contoh item (alias dipersingkat):

```json
{"id":"pull_up_bar","name":"Pull-Up Bar","aliases":["palang"],"modes":["gym","calisthenics"]}
```

Filter `mode` opsional menerima `gym` atau `calisthenics`. Alat bersama muncul
di kedua filter. Filter diterapkan sebelum pencarian nama; parameter tidak
valid atau berulang ditolak 400. Hubungan exercise tetap memakai requirements AND/OR,
bukan ditebak hanya dari kategori alat; metadata ini tidak mengubah program user.

Migration `0020_equipment_modes` mengisi seluruh 28 alat, menolak modes kosong,
nilai asing, null, atau duplikat, dan menaikkan `catalogVersion`. Item baru wajib
diklasifikasikan secara eksplisit. Mobile perlu menambah field array dan
menyegarkan cache katalog; tidak perlu mengganti ID alat atau data latihan lama.
Terapkan migrasi database **sebelum deploy API baru** yang membaca kolom ini;
API lama tetap kompatibel dengan penambahan kolom. Review migrasi lama yang
masih pending sebelum menjalankan `npm run db:migrate`, khususnya `0019` yang
menghapus kolom makanan. Jangan menerapkan penghapusan tersebut tanpa memastikan
rollout API makanan yang sesuai sudah selesai.

Status 19 Oktober 2026: migrasi `0019` dan `0020` telah diterapkan pada database
yang terhubung setelah persetujuan pengguna dan pemeriksaan API production.
Semua 28 alat memiliki kategori; ID/nama/alias tetap sama. `meal_catalog` kini
22 kolom, dengan nilai tiga kolom yang dihapus dicadangkan dalam file lokal
gitignored `.local-backups/migration-0019-meal-columns-2026-10-19.json`.
Security preflight lokal lolos. API Vercel perlu redeploy source terbaru agar
respons equipment mengirim `modes` dan menerima filter `mode`.

Pencarian exercise berdasarkan alat kini menggunakan `GET /api/v1/catalog/exercises?equipmentIds=...`.
Hasil hanya menunjukkan exercise terkait dengan sedikitnya satu alat pilihan,
bukan jaminan semua kebutuhan alat terpenuhi atau rekomendasi personal. Endpoint
lama `/equipment/exercises` dan bucket `ready`/`needsMoreEquipment` dihapus.
Lihat [panduan filter exercise](panduan-frontend-filter-exercise.md) untuk
kontrak dan migrasi frontend.

## API foto dan konfirmasi

`POST /api/v1/equipment/recognize` memerlukan Bearer Neon Auth. Kirim
`multipart/form-data` dengan tepat satu file field `photo`, tanpa field lain.
Jangan kirim URL gambar atau base64 pada API mobile.

```bash
curl -X POST http://localhost:3000/api/v1/equipment/recognize \
  -H 'Authorization: Bearer <NEON_AUTH_JWT>' \
  -F 'photo=@/path/to/equipment.jpg;type=image/jpeg'
```

Response sukses:

```json
{
  "modelId": "google/siglip2-base-patch16-224",
  "modelRevision": "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2",
  "status": "needs_confirmation",
  "candidates": [{"id": "dumbbell", "name": "Dumbbell", "aliases": ["dumbell", "halter", "dambel", "dumbel"], "score": 0.0013}],
  "equipmentCatalogVersion": "1",
  "requiresConfirmation": true,
  "warnings": ["MODEL_SCORES_ARE_NOT_CALIBRATED_ACCURACY", "CONFIRM_EQUIPMENT_BEFORE_SELECTING_EXERCISES", "FOCUS_PHOTO_ON_ONE_EQUIPMENT_ITEM"]
}
```

Angka di contoh bukan threshold atau tingkat akurasi. `score` adalah skor
sigmoid kecocokan gambar/teks dan **bukan persentase kepastian alat benar**.
Model dapat memberi skor kecil tetapi ranking yang berguna. Semua kandidat
foto wajib dikonfirmasi user sebelum memanggil endpoint exercises atau
menyimpan preferensi alat. API scan tidak menulis preferensi secara otomatis.

Jika `status = unknown`, `candidates = []`; tawarkan foto ulang atau input
nama. Foto blur, screenshot, benda nonalat atau berbagai alat sekaligus tidak
dipaksa menjadi satu hasil benar. Implementasi awal klasifikasi satu foto,
bukan deteksi bounding box/multiple-object detection. User harus mengambil
foto yang fokus pada satu alat.

Pencarian nama dan katalog tetap bekerja ketika service model mati. Foto
menghasilkan 503 `VISION_NOT_CONFIGURED` / `VISION_UNAVAILABLE`, tidak memakai
hasil palsu. 502 `INVALID_VISION_RESPONSE` menandakan kontrak upstream tidak
valid. 429 untuk batas scan atau service sibuk. ID, score, revision dan struktur
hasil diperiksa di Next.js; AI tidak membuat nama latihan baru.

## Validasi, privasi dan batas resource

- Maksimal file 4 MiB, request multipart 4 MiB + 64 KiB (di bawah batas Vercel
  4.5 MB), decoded image 16 Mi-pixel. Mobile perlu kompres foto sebelum upload.
- JPEG/PNG/static WebP saja, MIME harus sesuai format yang berhasil didecode.
  SVG/GIF/animated image dan file rusak ditolak. Upload dibatasi 20 detik.
- Next.js membetulkan orientation, resize maksimal 1024 × 1024 tanpa enlargement,
  flatten transparency, re-encode JPEG quality 80 dan membuang EXIF/GPS metadata.
- Foto hanya diproses dalam memori: tidak ada tabel foto/history, tidak ditulis
  ke disk atau dipakai otomatis sebagai data training. Cache disk hanya bobot model.
- Base64 hanya digunakan pada transport JSON **internal** Next.js–Python;
  bukan storage database. Service membatasi body 4 MiB / gambar 2 MiB, memvalidasi
  ulang format/pixel/encoding, dan tidak memantulkan payload gambar dalam error.
- Next.js produksi: 5 percobaan/user/60 detik melalui limiter PostgreSQL bersama,
  ditambah maksimal 2 scan aktif **per proses**.
  Python: 1 inference aktif, request lain 429; model dimuat sekali saat startup.
- Counter produksi tersimpan atomik di Neon lintas replica/serverless; bila
  limiter tidak tersedia, request ditolak 503. Gateway/WAF tetap diperlukan
  untuk volumetric abuse sebelum function/database dipanggil.
- Service memakai shared token acak 32–256 karakter, tidak menerima JWT mobile.
  Bind loopback/private network, jangan buka port inference ke internet tanpa
  firewall/TLS. Token tidak disimpan di app HP atau log. URL upstream hanya berasal
  dari konfigurasi server; redirect ditolak agar token tidak bocor.

## Model dan keterbatasan

Model: [SigLIP 2 Base dari Google](https://huggingface.co/google/siglip2-base-patch16-224),
open-weight Apache-2.0, revision dipin di kode agar startup tidak mengunduh
versi yang berubah. Safetensors digunakan, `trust_remote_code=False`.
Implementasi mengikuti [panduan SigLIP2 Transformers](https://huggingface.co/docs/transformers/model_doc/siglip2)
untuk prompt, fixed padding/max length 64 dan sigmoid score.

Candidate ID/name berasal dari database tiap request. Model membandingkan
label positif dengan contoh label nonalat (cat, dog, car, landscape, empty room,
screenshot of text). Gate penolakan saat label nonalat mengungguli semua alat,
atau skor alat terbaik <1e-6, **masih heuristik, belum OOD detector tervalidasi**.
Label negatif yang memakai kalimat “not exercise equipment” sengaja tidak dipakai:
image/text encoder dapat mencocokkan kata equipment tanpa memahami negasinya.
Gate tidak menjamin semua benda nonalat akan ditolak; konfirmasi tetap wajib.

Belum ada fine-tuning atau benchmark representatif untuk mesin gym yang mirip.
Perlu dataset uji berlisensi/berizin, variasi sudut/cahaya/background, kelas
nonalat dan metrik per kelas sebelum mengaktifkan penerimaan otomatis.
Jangan memilih threshold dari satu foto atau menganggap sigmoid sebagai accuracy.
Pembatasan gerakan/kemampuan user tetap ditangani API program recommendation,
bukan model pengenalan alat.

Tidak ada biaya API AI per scan jika self-hosted, tetapi CPU/RAM/listrik dan
hosting tetap memakai resource. Service menggunakan CPU (default 4 thread,
`EQUIPMENT_VISION_THREADS` dapat diatur 1–16). Free hosting tidak dijamin.
Jangan memuat model Python/bobot besar di setiap request Next.js serverless;
gunakan service persisten terpisah.

## Menjalankan lokal

Python 3.12 dan venv terpisah. Dependensi/model sudah dipasang di workspace
saat implementasi; langkah berikut untuk setup ulang di mesin lain:

```bash
python3.12 -m venv services/equipment-vision/.venv
services/equipment-vision/.venv/bin/python -m pip install --upgrade pip==26.2.1
services/equipment-vision/.venv/bin/python -m pip install -r services/equipment-vision/requirements-dev.txt
services/equipment-vision/.venv/bin/python services/equipment-vision/download_model.py
npm run db:migrate
npm run dev:vision
```

`dev:vision` menjalankan Next.js dan Uvicorn di 127.0.0.1:8100, dengan token
ephemeral bersama di environment proses jika belum ada token atau masih placeholder.
Tidak mengubah `.env` atau menampilkan token. Credential Neon/Auth tidak diteruskan
ke child service Python. Ctrl+C menghentikan kedua child
process miliknya. Model harus selesai startup sebelum foto bisa diproses.
Jangan menjalankan bersama server lain pada port yang sama.

Untuk service persisten, set token yang sama pada Next.js dan Python lalu:

```bash
services/equipment-vision/.venv/bin/python -m uvicorn main:app \
  --app-dir services/equipment-vision --host 127.0.0.1 --port 8100 --no-access-log
```

Next.js memakai `EQUIPMENT_VISION_URL`, `EQUIPMENT_VISION_TOKEN`, dan
`EQUIPMENT_VISION_TIMEOUT_MS` (default 30000, rentang 1000–60000). Secret nyata
harus berasal dari env/secret manager; jangan commit. `HF_HUB_OFFLINE=1` dapat
dipakai setelah download untuk memuat bobot dari cache tanpa Hub network.

## Pengujian

```bash
npm run test:equipment
npm run test:vision
npm run db:test-schema
npm run db:test-equipment
npm run test:vision-real
services/equipment-vision/.venv/bin/python -m pip_audit
```

`test:equipment` mencakup alias, ambiguity, AND/OR, alat tambahan, upload/MIME,
pixel limit, metadata stripping, kontrak HTTP upstream/error dan rate limits.
`test:vision` memakai classifier stub **khusus unit test** untuk auth/validasi/
busy/unknown. Tidak ada fallback stub pada runtime.
`db:test-equipment` membaca Neon nyata, seluruh 28 alat dan exercise mapping,
serta endpoint public/error/401. Tidak membuat akun/foto permanen.

`test:vision-real` memulai service sementara pada port lokal acak dengan token
ephemeral, memuat **model asli dari cache offline**, menguji foto dumbbell,
validasi hasil terhadap katalog Neon dan exercise terkait, lalu foto putih
untuk jalur unknown. Child service dihentikan setelah test. Ini smoke test,
bukan bukti akurasi semua 28 kelas atau pengujian UI mobile/login end-to-end.

Foto uji: [Dumbbell.JPG](https://commons.wikimedia.org/wiki/File:Dumbbell.JPG),
BGN-WMCO/Bangin, [CC BY 2.5](https://creativecommons.org/licenses/by/2.5/).
Diambil dari Wikimedia ke memori saja; resize/re-encode dan penghapusan metadata
hanya untuk inference. Tidak disimpan/didistribusikan sebagai aset proyek.
