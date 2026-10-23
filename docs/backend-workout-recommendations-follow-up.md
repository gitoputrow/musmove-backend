# Perbaikan pembagian dan variasi rekomendasi workout

Tanggal: 23 Oktober 2026.

## Masalah dan hasil

Profil contoh memiliki fokus leg, chest, back dan meminta tiga sesi, tetapi
trainingLevel masih null. Sebelumnya fallback beginner membatasi dua sesi,
urutan tetap membuat back tidak terjadwal, dan template chest/back lama hanya
berisi satu latihan. Banyak pilihan exercise di katalog tidak otomatis menjadi
variasi program karena exercise dan template program disimpan terpisah.

Perbaikan source:

- Batas frekuensi beginner/intermediate 3, advanced 4; setelah jeda latihan
  panjang tetap maksimal 2. Tidak melebihi permintaan pengguna. Dosis konservatif,
  guard usia/konteks, alat, kemampuan, dan durasi tetap berlaku.
- Fokus tersedia dibagi merata sebelum diulang. Jika slot kurang, rotasi memakai
  penyelesaian rekomendasi terbaru: jumlah paling sedikit, lalu paling lama,
  lalu urutan kanonis. Tidak menambahkan hari atau mengarang fokus yang tersaring.
- 29 template baru dengan 3–4 latihan dari katalog existing; total 41 template.
  Seluruh 12 template/ID lama tetap tersedia sebagai compact/histori. Tidak ada
  perubahan profil, level akun, snapshot workout, atau receipt lama.
- Kandidat standard (minimal 3 latihan total) mendahului compact, kemudian
  variasi paling jarang/lebih lama dipakai. Label ini bukan jaminan fisiologis
  kelengkapan latihan; beberapa latihan merupakan core/accessory.
- Null trainingLevel tetap null di DB. Respons menandainya secara eksplisit,
  bukan menganggap pengguna telah memilih beginner.

## Tindakan mobile

1. Gunakan `weeklyPlan` sebagai sesi yang ditawarkan dan cari detail melalui
   `programId` dalam `programs`. `programs` adalah alternatif, bukan seluruh
   sesi wajib atau daftar yang cukup diambil N pertama.
2. Render `focusCoverage`: unavailable berarti tidak lolos filter; unscheduled
   berarti belum masuk slot (termasuk slot tidak cukup). Jangan mengklaim semua
   fokus terjadwal jika array tersebut masih berisi nilai.
3. Minta pilihan trainingLevel eksplisit pada onboarding/editor profil.
   Gunakan endpoint dan versi/idempotensi yang sudah ada; tidak perlu tabel,
   endpoint baru, atau request kedua setelah sukses. Jangan mengisi jawaban
   berdasarkan tebakan. Omission mempertahankan nilai; null mengosongkan.
4. Jika `personalization.trainingLevelSource = CONSERVATIVE_DEFAULT` dan
   `missingProfileFields` memuat trainingLevel, tampilkan ajakan melengkapi level.
   `trainingLevel` efektif di respons saat itu beginner, bukan nilai profil.
   Bila diisi pengguna, source menjadi PROFILE dan daftar missing kosong.
5. Setelah workout recommended selesai dan submit sukses, invalidasi cache
   rekomendasi; fetch saat layar terkait dibutuhkan. Tidak ada polling atau
   penambahan GET /meta pada startup.

Body PATCH /api/v1/me (contoh; ganti versi dan level dengan pilihan nyata):

```json
{
  "baseVersions": { "profile": "<versi profil terakhir>" },
  "profile": { "trainingLevel": "beginner" }
}
```

Tetap kirim Authorization dan Idempotency-Key seperti write profil lain.
Kontrak envelope lengkap mengikuti [panduan utama](frontend-follow-up-online-api.md).

## Makna histori dan rencana

Riwayat menggunakan maksimum 20 workout milik akun, completed, nondeleted,
mode sama, 30 hari terakhir dan tidak di masa depan. Kredit rotasi hanya untuk
source recommended dengan ID program katalog dikenal. Program katalog nonaktif
tetap dapat memberi kredit fokus historis, tetapi tidak menjadi kandidat baru.
Custom/manual atau provenance lama ambigu tidak menyamar sebagai rekomendasi.
Ini tetap hasil lapor pengguna, bukan bukti pengguna benar-benar melakukan latihan.

`weeklyPlan` adalah saran hingga N sesi berikutnya, tidak disimpan sebagai kalender,
tidak menghitung sisa kuota minggu kalender, dan tidak berubah acak setiap dibuka.
Slot kurang dari jumlah fokus tetap mungkin; workout yang dilaporkan selesai
mengubah prioritas berikutnya. Filter bisa membuat template compact atau tidak
ada template sama sekali. Tidak ada pemaksaan beban atau pengisian durasi penuh.

## Rollout dan verifikasi

Source memuat algorithmVersion "3" dan capability
`balancedWorkoutRecommendations: true`. Terapkan migrasi katalog
`0022_richer_workout_programs` setelah 0021; tidak memerlukan env baru atau
penghapusan kolom. Migrasi hanya menambah template dan entri latihan publik,
kompatibel dengan pembaca katalog lama. Logika v3 tetap memerlukan deploy source.

Hasil pemeriksaan 23 Oktober 2026:

- Migrasi 0022 berhasil diterapkan ke database Neon yang dikonfigurasi; 23
  migrasi tercatat, tidak ada yang tertunda. Katalog menjadi 41 template.
- GET katalog publik pada deployment juga mengembalikan 41 template, termasuk
  29 template baru, catalogVersion "3".
- Perhitungan read-only memakai source lokal baru dan profil test di database
  menghasilkan tiga sesi: leg, back, chest, masing-masing tiga latihan.
  Ketiganya lolos batas waktu pengguna; profil/versi/timestamp tetap sama dan
  trainingLevel tetap null. Urutan mengikuti histori nyata, bukan checkbox.
- Ini **bukan** pengujian login/JWT atau endpoint rekomendasi baru di Vercel.
  Capability balancedWorkoutRecommendations masih belum tersedia pada deployment
  saat diperiksa; **redeploy source baru diperlukan**. Tidak ada push/deploy
  cloud yang dilakukan dalam pekerjaan ini.

Catatan keamanan terpisah: build dan npm audit mendeteksi Next.js 16.4.0 masih
terdampak advisory critical/high. Audit menunjukkan patch 16.4.2 tersedia.
Build ulang berhasil setelah reminder, tetapi itu **tidak memperbaiki kerentanan**.
Upgrade dependency belum dilakukan sebagai bagian perubahan rekomendasi ini;
prioritaskan patch dan regresi sebelum deploy. Rujukan:
[advisory Image Optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
[Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), dan
[use cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr).

Tes regresi mencakup tiga fokus/tiga sesi, level null tanpa write, explicit level
roundtrip, pemerataan/rotasi, provenance workout, template nonaktif, alat/durasi,
preservasi seluruh template lama, dan migrasi additive. Uji in-memory bukan
pengganti tes login dan alur final workout oleh mobile setelah deploy.

## Dasar dan batas kebijakan

Batas frekuensi adalah kebijakan produk, bukan diagnosis atau resep personal.
Rentang pemula 2–3 hari disebut dalam
[position stand ACSM 2009](https://pubmed.ncbi.nlm.nih.gov/19204579/), sedangkan
[pembaruan ACSM 2026](https://acsm.org/resistance-training-guidelines-update-2026/)
menekankan konsistensi dan individualisasi, termasuk melatih kelompok otot utama
minimal dua kali seminggu. Split fokus ini tidak menjamin semua kelompok otot
mendapat frekuensi tersebut dan tidak diklaim sebagai program klinis tervalidasi.
Detail aturan: [program-personalization.md](program-personalization.md).
