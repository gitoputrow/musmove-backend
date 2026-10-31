# Exercise movement tags

Setelah migrasi0027 terdapat 143 exercise tersimpan (113 gym, 30 calisthenics),
termasuk dua row nonaktif yang dipertahankan untuk histori. Lima variasi baru
memiliki tag eksplisit pada migrasi0026. Setelah migrasi0025 terdapat 125 exercise.
Enam chest press plate-loaded baru menggunakan tag `shoulder`, `elbow`, `wrist`;
target otot disimpan terpisah sebagai `muscleTargets`, bukan disimpulkan dari tag.

Seluruh 117 exercise (88 gym, 29 calisthenics), termasuk yang nonaktif, diberi
pemetaan eksplisit berdasarkan pasangan mode/id pada migrasi
`0011_complete_exercise_movement_tags.sql`. Sebelumnya 95 record belum memiliki
tag. Tidak ada fallback berbasis nama, regex nama exercise, atau tag generik
untuk sekadar mengisi kolom. Label, equipment requirements, sets/reps dan ID
tidak diubah. Pemetaan juga memperbaiki 12 set tag lama; perbedaan urutan saja
tidak dihitung sebagai koreksi.

## Arti dan batasan

Tag merupakan **interpretasi produk atas gerakan standar**, bukan daftar otot
target, tingkat bahaya, diagnosis atau persetujuan medis. Bagian tubuh ditandai
jika menjadi area gerakan/beban utama, penopang aktif atau stabilisasi signifikan.
Bukan semua bagian tubuh yang kebetulan menyentuh bangku/mesin.
`back` mencakup punggung secara umum (termasuk otot punggung atas dan stabilisasi
tulang belakang), bukan hanya lumbar. Pembedaan lumbar vs thoracic belum didukung
profil user saat ini. Tangan menggenggam/menopang beban dapat melibatkan
`wrist` dan `elbow` meski gerakan sendinya kecil.

| Tag | Makna operasional |
| --- | --- |
| shoulder, elbow, wrist | Bahu, siku dan pergelangan tangan yang bergerak atau menopang beban |
| back, hip, knee, ankle | Punggung, pinggul, lutut dan pergelangan kaki yang bergerak/menopang atau menstabilkan secara signifikan |
| floor_transfer | Eksekusi/setup standar mengharuskan masuk/keluar posisi tubuh di lantai; bukan sekadar mengangkat barbel dari lantai |
| overhead_reach | Eksekusi atau posisi awal mencakup jangkauan lengan overhead relatif terhadap torso, termasuk pull-up, pulldown dan pullover |
| deep_knee_bend | Fleksi lutut besar pada rentang gerak standar; bukan hanya lutut sedikit ditekuk |
| balance_challenge | Dukungan tubuh terbatas/berubah atau gerakan lower-body tanpa pegangan yang memerlukan dukungan jika user melaporkan keseimbangan terbatas |

Contoh pembeda: floor press memiliki `floor_transfer`, bench/machine chest
press tidak. Bodyweight squat tidak memiliki tag pergelangan tangan, goblet
squat memilikinya karena memegang beban. Row chest-supported tetap memiliki
`back` karena gerakan punggung atas, tetapi tidak diberi tag keseimbangan
seperti row berdiri membungkuk. Chair sit-to-stand/supported reverse lunge
tidak memiliki `balance_challenge`, sedangkan squat tanpa pegangan memilikinya.

## Sumber dan asumsi eksekusi

Pemetaan tag adalah inferensi engineering dari panduan gerakan, **bukan tag
yang diterbitkan atau disahkan ACE**. Referensi diperiksa 11 Oktober 2026:

- [ACE lateral raise](https://www.acefitness.org/resources/everyone/exercise-library/26/lateral-raise/):
  versi standar berhenti setinggi bahu. Tag lama `overhead_reach` dihapus.
- [ACE barbell chest press](https://www.acefitness.org/resources/everyone/exercise-library/5/chest-press/)
  dan [dumbbell chest press](https://www.acefitness.org/resources/everyone/exercise-library/19/chest-press/)
  mendukung eksekusi di bench, bukan lantai.
- [ACE bent-over row](https://www.acefitness.org/resources/everyone/exercise-library/12/bent-over-row/):
  posisi hinge berbeda dari chest-supported row.
- [ACE renegade row](https://www.acefitness.org/resources/everyone/exercise-library/355/renegade-row/):
  dukungan tangan dan stabilisasi torso dalam posisi plank.
- [ACE lying pullover](https://www.acefitness.org/resources/everyone/exercise-library/37/lying-pullovers/)
  dan [seated lat pulldown](https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/)
  mendukung penandaan jangkauan overhead.
- [ACE triceps extension](https://www.acefitness.org/resources/everyone/exercise-library/74/triceps-extension/)
  merupakan acuan versi dumbbell overhead untuk ID generik `triceps_extension`.
- [ACE step-up](https://www.acefitness.org/resources/everyone/exercise-library/28/step-up/)
  dan [seated leg press](https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/)
  menjadi acuan gerakan lower-body.
- [ACE pembahasan leg curl](https://www.acefitness.org/continuing-education/prosource/september-2014/4975/best-exercises-for-great-legs-and-pain-free-knees/)
  membedakan fleksi lutut dari gerakan pinggul.

Variasi dengan equipment/grip berbeda mewarisi gerakan dasarnya, lalu memakai
tag setup/postur masing-masing. Flat/decline/incline chest press dan fly biasa
tidak diklasifikasi sebagai overhead press; incline tinggi mendekati vertical
press memerlukan ID/panduan terpisah. Tidak semua gerakan bahu disebut overhead.

Beberapa nama lama tidak menentukan semua detail teknik, sehingga batasnya
dicatat di sini, bukan ditambahkan sebagai atribut database baru:

- `row` gym memakai asumsi dumbbell row dengan hinge; katalog tidak mensyaratkan
  bench sehingga pembatasan keseimbangan/hinge diterapkan secara konservatif.
- `single_arm_cable_row` memakai varian seated; varian standing sudah mempunyai
  ID terpisah. `leg_curl` mencakup seated/prone machine di atas mesin, bukan lantai.
- `triceps_extension` memakai versi overhead di atas; lying/kickback perlu ID
  berbeda agar pembatasan overhead tidak salah diterapkan.
- Bench-supported single-arm/alternating press mendapat `back` untuk stabilisasi
  antirotasi, tetapi tidak diasumsikan memakai offset bridge.
- Mesin pec deck/pullover dapat memakai grip atau pad lengan; tag area lengan
  bersifat konservatif karena model mesin spesifik belum tersimpan.
- Step-up mensyaratkan bench dan leg curl memakai full ROM. Bench lebih rendah
  atau partial ROM dapat berbeda dari tag `deep_knee_bend`; bukan cutoff klinis
  berbasis sudut yang telah diukur.
- Tidak memasukkan setiap variasi teknik/improvisasi ke satu ID. Jika implementasi
  gerakan berbeda, review tag atau tambahkan ID varian sebelum merekomendasikannya.

## Validasi dan penggunaan

Database mewajibkan movement_tags non-null, satu dimensi, berisi 1–11 tag
dikenal, tanpa elemen null/blank. Tidak ada default otomatis untuk exercise baru.
Data seed mempunyai tag unik; validasi runtime juga menolak duplikat.
`validMovementTags` memvalidasi vocabulary bersama, dan pembatasan rekomendasi
bersifat fail-closed terhadap array kosong, null atau malformed.

Katalog tidak mengubah response API exercise publik: tag tetap internal backend.
Perubahan katalog menaikkan catalogVersion lewat trigger. Snapshot workout user
tidak diubah. `test:movement-tags`, `test:programs`, `db:test-schema` dan
`db:test-movement-tags` memeriksa coverage, aturan pembeda, constraint dan
persistensi Neon. Tag tidak menjamin program aman untuk suatu kondisi medis.

## Pemetaan lengkap

| Mode | ID / exercise | movementTags |
| --- | --- | --- |
| gym | `alternating_dumbbell_bench_press` — Alternating Dumbbell Bench Press | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `assisted_pull_up_machine` — Assisted Pull-Up Machine | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `back_squat` — Barbell back squat | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `knee`, `ankle`, `deep_knee_bend`, `balance_challenge` |
| gym | `barbell_floor_press` — Barbell Floor Press | `shoulder`, `elbow`, `wrist`, `floor_transfer` |
| gym | `barbell_pullover` — Barbell Pullover | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `barbell_row` — Barbell row | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `balance_challenge` |
| gym | `barbell_seal_row` — Barbell Seal Row | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `bench_press` — Barbell bench press | `shoulder`, `elbow`, `wrist` |
| gym | `bent_over_dumbbell_row` — Bent-Over Dumbbell Row | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `balance_challenge` |
| gym | `bulgarian_split_squat` — Bulgarian split squat | `wrist`, `back`, `hip`, `knee`, `ankle`, `deep_knee_bend`, `balance_challenge` |
| gym | `calf_raise` — Dumbbell calf raise | `wrist`, `ankle`, `balance_challenge` |
| gym | `chair_sit_to_stand` — Chair sit-to-stand | `back`, `hip`, `knee`, `ankle` |
| gym | `chest_supported_dumbbell_row` — Chest-Supported Dumbbell Row | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `chest_supported_row_machine` — Chest-Supported Row Machine | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `close_grip_lat_pulldown` — Close-Grip Lat Pulldown | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `curl` — Dumbbell curl | `elbow`, `wrist` |
| gym | `dead_bug` — Dead bug | `shoulder`, `back`, `hip`, `floor_transfer` |
| gym | `deadlift` — Barbell deadlift | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `knee`, `ankle`, `balance_challenge` |
| gym | `decline_barbell_bench_press` — Decline Barbell Bench Press | `shoulder`, `elbow`, `wrist` |
| gym | `decline_chest_press_machine` — Decline Chest Press Machine | `shoulder`, `elbow`, `wrist` |
| gym | `decline_dumbbell_bench_press` — Decline Dumbbell Bench Press | `shoulder`, `elbow`, `wrist` |
| gym | `decline_dumbbell_fly` — Decline Dumbbell Fly | `shoulder`, `elbow`, `wrist` |
| gym | `dumbbell_floor_fly` — Dumbbell Floor Fly | `shoulder`, `elbow`, `wrist`, `floor_transfer` |
| gym | `dumbbell_fly` — Dumbbell fly | `shoulder`, `elbow`, `wrist` |
| gym | `dumbbell_pullover` — Dumbbell Pullover | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `dumbbell_renegade_row` — Dumbbell Renegade Row | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `floor_transfer`, `balance_challenge` |
| gym | `dumbbell_seal_row` — Dumbbell Seal Row | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `dumbbell_shoulder_press` — Dumbbell shoulder press | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `dumbbell_squeeze_press` — Dumbbell Squeeze Press | `shoulder`, `elbow`, `wrist` |
| gym | `face_pull` — Face pull | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `flat_bench_cable_chest_press` — Flat Bench Cable Chest Press | `shoulder`, `elbow`, `wrist` |
| gym | `flat_bench_cable_fly` — Flat Bench Cable Fly | `shoulder`, `elbow`, `wrist` |
| gym | `flat_dumbbell_bench_press` — Flat Dumbbell Bench Press | `shoulder`, `elbow`, `wrist` |
| gym | `front_squat` — Barbell front squat | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `knee`, `ankle`, `deep_knee_bend`, `balance_challenge` |
| gym | `hammer_curl` — Hammer curl | `elbow`, `wrist` |
| gym | `high_row_machine` — High Row Machine | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `high_to_low_cable_fly` — High-to-Low Cable Fly | `shoulder`, `elbow`, `wrist`, `back`, `balance_challenge` |
| gym | `hip_thrust` — Barbell hip thrust | `back`, `hip`, `knee`, `floor_transfer` |
| gym | `incline_barbell_bench_press` — Incline Barbell Bench Press | `shoulder`, `elbow`, `wrist` |
| gym | `incline_bench_cable_chest_press` — Incline Bench Cable Chest Press | `shoulder`, `elbow`, `wrist` |
| gym | `incline_bench_cable_fly` — Incline Bench Cable Fly | `shoulder`, `elbow`, `wrist` |
| gym | `incline_bench_dumbbell_row` — Incline Bench Dumbbell Row | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `incline_chest_press_machine` — Incline Chest Press Machine | `shoulder`, `elbow`, `wrist` |
| gym | `incline_dumbbell_fly` — Incline Dumbbell Fly | `shoulder`, `elbow`, `wrist` |
| gym | `incline_dumbbell_press` — Incline dumbbell press | `shoulder`, `elbow`, `wrist` |
| gym | `iso_lateral_row_machine` — Iso-Lateral Row Machine | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `landmine_single_arm_row` — Landmine Single-Arm Row | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `balance_challenge` |
| gym | `lat_pulldown` — Lat pulldown | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `leg_curl` — Leg curl | `knee`, `deep_knee_bend` |
| gym | `leg_extension` — Leg extension | `knee` |
| gym | `leg_press` — Leg press | `back`, `hip`, `knee`, `ankle`, `deep_knee_bend` |
| gym | `low_row_machine` — Low Row Machine | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `low_to_high_cable_fly` — Low-to-High Cable Fly | `shoulder`, `elbow`, `wrist`, `back`, `balance_challenge` |
| gym | `lunge` — Reverse lunge | `hip`, `knee`, `ankle`, `deep_knee_bend`, `balance_challenge` |
| gym | `meadows_row` — Meadows Row | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `balance_challenge` |
| gym | `neutral_grip_dumbbell_bench_press` — Neutral-Grip Dumbbell Bench Press | `shoulder`, `elbow`, `wrist` |
| gym | `neutral_grip_lat_pulldown` — Neutral-Grip Lat Pulldown | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `overhead_press` — Barbell overhead press | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `paused_barbell_bench_press` — Paused Barbell Bench Press | `shoulder`, `elbow`, `wrist` |
| gym | `pec_deck_butterfly_machine` — Pec Deck / Butterfly Machine | `shoulder`, `elbow`, `wrist` |
| gym | `pendlay_row` — Pendlay Row | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `balance_challenge` |
| gym | `press` — Dumbbell floor press | `shoulder`, `elbow`, `wrist`, `floor_transfer` |
| gym | `pullover_machine` — Pullover Machine | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `raise` — Lateral raise | `shoulder`, `elbow`, `wrist` |
| gym | `reverse_grip_lat_pulldown` — Reverse-Grip Lat Pulldown | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `romanian_deadlift` — Romanian deadlift | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `knee`, `balance_challenge` |
| gym | `row` — Dumbbell row | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `balance_challenge` |
| gym | `seated_cable_row` — Seated cable row | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `seated_chest_press_machine` — Seated Chest Press Machine | `shoulder`, `elbow`, `wrist` |
| gym | `single_arm_cable_chest_press` — Single-Arm Cable Chest Press | `shoulder`, `elbow`, `wrist`, `back`, `balance_challenge` |
| gym | `single_arm_cable_row` — Single-Arm Cable Row | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `single_arm_dumbbell_bench_press` — Single-Arm Dumbbell Bench Press | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `single_arm_lat_pulldown` — Single-Arm Lat Pulldown | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `smith_machine_bench_press` — Smith Machine Bench Press | `shoulder`, `elbow`, `wrist` |
| gym | `smith_machine_decline_bench_press` — Smith Machine Decline Bench Press | `shoulder`, `elbow`, `wrist` |
| gym | `smith_machine_incline_bench_press` — Smith Machine Incline Bench Press | `shoulder`, `elbow`, `wrist` |
| gym | `squat` — Goblet squat | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `knee`, `ankle`, `deep_knee_bend`, `balance_challenge` |
| gym | `standing_cable_chest_press` — Standing Cable Chest Press | `shoulder`, `elbow`, `wrist`, `back`, `balance_challenge` |
| gym | `standing_cable_fly` — Standing Cable Fly | `shoulder`, `elbow`, `wrist`, `back`, `balance_challenge` |
| gym | `standing_cable_row` — Standing Cable Row | `shoulder`, `elbow`, `wrist`, `back`, `balance_challenge` |
| gym | `straight_arm_cable_pulldown` — Straight-Arm Cable Pulldown | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `overhead_reach` |
| gym | `supported_reverse_lunge` — Supported reverse lunge | `hip`, `knee`, `ankle`, `deep_knee_bend` |
| gym | `t_bar_row` — T-Bar Row | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `balance_challenge` |
| gym | `triceps_extension` — Dumbbell triceps extension | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `underhand_barbell_row` — Underhand Barbell Row | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `balance_challenge` |
| gym | `underhand_seated_cable_row` — Underhand Seated Cable Row | `shoulder`, `elbow`, `wrist`, `back` |
| gym | `wide_grip_lat_pulldown` — Wide-Grip Lat Pulldown | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| gym | `wide_grip_seated_cable_row` — Wide-Grip Seated Cable Row | `shoulder`, `elbow`, `wrist`, `back` |
| calisthenics | `band_assisted_pullup` — Band-assisted pull-up | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| calisthenics | `bird_dog` — Bird dog | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `knee`, `floor_transfer`, `balance_challenge` |
| calisthenics | `bodyweight_calf_raise` — Bodyweight calf raise | `ankle`, `balance_challenge` |
| calisthenics | `bridge` — Glute bridge | `back`, `hip`, `knee`, `floor_transfer` |
| calisthenics | `chair_sit_to_stand` — Chair sit-to-stand | `back`, `hip`, `knee`, `ankle` |
| calisthenics | `chinup` — Chin-up | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| calisthenics | `crunch` — Crunch | `back`, `floor_transfer` |
| calisthenics | `dead_bug` — Dead bug | `shoulder`, `back`, `hip`, `floor_transfer` |
| calisthenics | `decline_pushup` — Decline push-up | `shoulder`, `elbow`, `wrist`, `back`, `floor_transfer`, `balance_challenge` |
| calisthenics | `diamond` — Diamond push-up | `shoulder`, `elbow`, `wrist`, `back`, `floor_transfer` |
| calisthenics | `dips` — Parallel bar dip | `shoulder`, `elbow`, `wrist`, `balance_challenge` |
| calisthenics | `incline_pushup` — Incline push-up | `shoulder`, `elbow`, `wrist`, `back` |
| calisthenics | `inverted_row` — Inverted row | `shoulder`, `elbow`, `wrist`, `back`, `floor_transfer` |
| calisthenics | `knee_pushup` — Knee push-up | `shoulder`, `elbow`, `wrist`, `back`, `knee`, `floor_transfer` |
| calisthenics | `lunge` — Reverse lunge | `hip`, `knee`, `ankle`, `deep_knee_bend`, `balance_challenge` |
| calisthenics | `lying_leg_raise` — Lying leg raise | `back`, `hip`, `floor_transfer` |
| calisthenics | `mountain_climber` — Mountain climber | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `knee`, `ankle`, `floor_transfer`, `balance_challenge` |
| calisthenics | `pike_pushup` — Pike push-up | `shoulder`, `elbow`, `wrist`, `back`, `hip`, `overhead_reach`, `floor_transfer`, `balance_challenge` |
| calisthenics | `pullup` — Pull-up | `shoulder`, `elbow`, `wrist`, `back`, `overhead_reach` |
| calisthenics | `pushup` — Push-up | `shoulder`, `elbow`, `wrist`, `back`, `floor_transfer` |
| calisthenics | `reverse_crunch` — Reverse crunch | `back`, `hip`, `floor_transfer` |
| calisthenics | `ring_row` — Ring row | `shoulder`, `elbow`, `wrist`, `back`, `balance_challenge` |
| calisthenics | `single_leg_bridge` — Single-leg glute bridge | `back`, `hip`, `knee`, `floor_transfer`, `balance_challenge` |
| calisthenics | `split_squat` — Split squat | `hip`, `knee`, `ankle`, `deep_knee_bend`, `balance_challenge` |
| calisthenics | `squat` — Bodyweight squat | `back`, `hip`, `knee`, `ankle`, `deep_knee_bend`, `balance_challenge` |
| calisthenics | `step_up` — Step-up | `hip`, `knee`, `ankle`, `deep_knee_bend`, `balance_challenge` |
| calisthenics | `supported_reverse_lunge` — Supported reverse lunge | `hip`, `knee`, `ankle`, `deep_knee_bend` |
| calisthenics | `wall_pushup` — Wall push-up | `shoulder`, `elbow`, `wrist` |
| calisthenics | `wide_pushup` — Wide push-up | `shoulder`, `elbow`, `wrist`, `back`, `floor_transfer` |
