-- Reviewed Google Maps identity links, checked 2026-11-14.
-- 101 verified profile CIDs; 3 explicit name/address searches awaiting a verified profile.
-- Preserve the existing Musclebound CID, place attributes, coordinates and favorites.
-- Match the previous coordinate URL so a later manually corrected link is never overwritten.
-- Skip the UPDATE statement entirely when nothing matches (catalog triggers are statement-level).
DO $maps_migration$
DECLARE
  links jsonb := $place_map_links$
[
  {
    "id": "jakarta-anytime-fitness-antasari-place",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.28974%2C106.80675",
    "google_maps_url": "https://www.google.com/maps/?cid=6992866351523884636",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/cilandak/anytime-fitness-antasari-place-cila-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=6992866351523884636",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-bella-terra",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.17391%2C106.89358",
    "google_maps_url": "https://www.google.com/maps/?cid=11844998446371487550",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-utara/kelapa-gading/anytime-fitness-bella-terra-kela-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=11844998446371487550",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-cikini",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1912%2C106.83868",
    "google_maps_url": "https://www.google.com/maps/?cid=2306570086824506866",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-pusat/menteng/anytime-fitness-cikini-ment-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=2306570086824506866",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-citra-kemayoran",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.15968%2C106.85223",
    "google_maps_url": "https://www.google.com/maps/?cid=4047054544457762331",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-pusat/kemayoran/anytime-fitness-citra-xperienc-kema-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4047054544457762331",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-citywalk-sudirman",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.21096%2C106.81797",
    "google_maps_url": "https://www.google.com/maps/?cid=4999083732957709887",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-pusat/tanah-abang/anytime-fitness-citywalk-sudir-tana-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4999083732957709887",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-de-ritz-menteng",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.19821%2C106.82608",
    "google_maps_url": "https://www.google.com/maps/?cid=14486877341483995163",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-pusat/menteng/anytime-fitness-de-ritz-menten-ment-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=14486877341483995163",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-gandaria",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.24238%2C106.78857",
    "google_maps_url": "https://www.google.com/maps/?cid=2811490346962361667",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/kebayoran-lama/anytime-fitness-gandaria-keba-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=2811490346962361667",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-green-sedayu-mall",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.13767%2C106.72335",
    "google_maps_url": "https://www.google.com/maps/?cid=9152756165757553",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-barat/cengkareng/anytime-fitness-green-sedayu-m-ceng-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=9152756165757553",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-greenville",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.16973%2C106.75114",
    "google_maps_url": "https://www.google.com/maps/?cid=13905543530191591150",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-barat/cengkareng/anytime-fitness-greenville-ceng-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=13905543530191591150",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-hublife-taman-anggrek",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.18333%2C106.79621",
    "google_maps_url": "https://www.google.com/maps/?cid=9931501535694987437",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-barat/grogol-petamburan/anytime-fitness-hublife-taman--grog-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=9931501535694987437",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-jtown-jatinegara",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.21923%2C106.85535",
    "google_maps_url": "https://www.google.com/maps/?cid=4469081243585145168",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-timur/jatinegara/anytime-fitness-jtown-jatinega-jati-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4469081243585145168",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-kebon-jeruk-akr-tower",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.19106%2C106.76793",
    "google_maps_url": "https://www.google.com/maps/?cid=7338428639410514986",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-barat/cengkareng/anytime-fitness-kebon-jeruk-ceng-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=7338428639410514986",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-la-codefin-kemang",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.25576%2C106.81278",
    "google_maps_url": "https://www.google.com/maps/?cid=14658727658066042804",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/mampang-prapatan/anytime-fitness-la-codefin-kem-mamp-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=14658727658066042804",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-lippo-mall-nusantara",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.21946%2C106.81461",
    "google_maps_url": "https://www.google.com/maps/?cid=1651081493623775124",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/setiabudi/anytime-fitness-lippo-mall-nus-seti-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=1651081493623775124",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-mall-of-indonesia",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.15067%2C106.88828",
    "google_maps_url": "https://www.google.com/maps/?cid=1462758036504462549",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/kebayoran-baru/anytime-fitness-moi-keba-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=1462758036504462549",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-mampang",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.26517%2C106.8303",
    "google_maps_url": "https://www.google.com/maps/?cid=10849168582946120900",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/mampang-prapatan/anytime-fitness-mampang-mamp-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=10849168582946120900",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-menara-cakrawala",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1865%2C106.8238",
    "google_maps_url": "https://www.google.com/maps/?cid=13305349041130847268",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-pusat/menteng/anytime-fitness-menara-cakrawa-ment-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=13305349041130847268",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-pasaraya-blok-m",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.24426%2C106.80266",
    "google_maps_url": "https://www.google.com/maps/?cid=9246539392051762444",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/kebayoran-baru/anytime-fitness-pasaraya-blok--keba-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=9246539392051762444",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-puri-indah-cni",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.19054%2C106.73788",
    "google_maps_url": "https://www.google.com/maps/?cid=6870501697528784126",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-barat/kembangan/anytime-fitness-puri-indah-kemb-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=6870501697528784126",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-rosthen-garden-slipi",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.18876%2C106.79791",
    "google_maps_url": "https://www.google.com/maps/?cid=1270370175094732518",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-barat/palmerah/anytime-fitness-rosthen-garden-palm-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=1270370175094732518",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-sakura-garden-city",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.32355%2C106.88877",
    "google_maps_url": "https://www.google.com/maps/?cid=9561057700494812697",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-timur/cipayung/anytime-fitness-sakura-garden--cipa-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=9561057700494812697",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-sarana-square",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.23366%2C106.84795",
    "google_maps_url": "https://www.google.com/maps/?cid=4181520786932231645",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/tebet/anytime-fitness-sarana-square-tebe-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4181520786932231645",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-sedayu-city",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.16896%2C106.92151",
    "google_maps_url": "https://www.google.com/maps/?cid=12665856080601202270",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-timur/cakung/anytime-fitness-suite-life-sed-caku-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=12665856080601202270",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-senopati",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.23621%2C106.81633",
    "google_maps_url": "https://www.google.com/maps/?cid=16775647388913847367",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/kebayoran-baru/anytime-fitness-senopati-keba-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=16775647388913847367",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-setiabudi-one",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.21521%2C106.82998",
    "google_maps_url": "https://www.google.com/maps/?cid=13054004168535111529",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/setiabudi/anytime-fitness-setiabudi-one-seti-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=13054004168535111529",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-simatupang",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.29232%2C106.78355",
    "google_maps_url": "https://www.google.com/maps/?cid=7791181434320184297",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/cilandak/anytime-fitness-simatupang-cila-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=7791181434320184297",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-sopo-del-mega-kuningan",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.22813%2C106.82458",
    "google_maps_url": "https://www.google.com/maps/?cid=12732802048417068127",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/setiabudi/anytime-fitness-sopo-del-mega--seti-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=12732802048417068127",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-sunter-mall",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.13813%2C106.87095",
    "google_maps_url": "https://www.google.com/maps/?cid=1488071143765095728",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-utara/penjaringan/anytime-fitness-sunter-mall-penj-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=1488071143765095728",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-the-amboja",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.30942%2C106.90115",
    "google_maps_url": "https://www.google.com/maps/?cid=14617178916568064554",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/kebayoran-baru/anytime-fitness-the-amboja-keba-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=14617178916568064554",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-anytime-fitness-the-hive-cawang",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2445%2C106.8755",
    "google_maps_url": "https://www.google.com/maps/?cid=12363575814345278792",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-timur/jatinegara/anytime-fitness-the-hive-cawan-jati-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=12363575814345278792",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-benhil",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.20645%2C106.809834",
    "google_maps_url": "https://www.google.com/maps/?cid=341125052736836854",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/benhil",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=341125052736836854",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-bintaro-sektor-1",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2430762%2C106.7573816",
    "google_maps_url": "https://www.google.com/maps/?cid=4984010109308275984",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/bintaro-sektor-1",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4984010109308275984",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-blok-m",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2107188%2C106.8025269",
    "google_maps_url": "https://www.google.com/maps/?cid=17048554996000258456",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/blok-m",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=17048554996000258456",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-cempaka-putih",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1426306%2C106.8653664",
    "google_maps_url": "https://www.google.com/maps/?cid=8223027017747443868",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/cempaka-putih",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=8223027017747443868",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-cideng",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1761323%2C106.8118328",
    "google_maps_url": "https://www.google.com/maps/?cid=10664827744288440860",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-pusat/gambir/fit-hub-cideng-gamb-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=10664827744288440860",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-danau-sunter-utara",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1393407%2C106.8614411",
    "google_maps_url": "https://www.google.com/maps/?cid=2733783841721293800",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/danau-sunter-utara",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=2733783841721293800",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-duren-sawit",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2291973%2C106.9111136",
    "google_maps_url": "https://www.google.com/maps/?cid=8071187682815736033",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/duren-sawit",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=8071187682815736033",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-elang-laut-pik",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1238713%2C106.7432083",
    "google_maps_url": "https://www.google.com/maps/?cid=4774351024183367457",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/elang-laut-pik",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4774351024183367457",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-fatmawati",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2724586%2C106.797445",
    "google_maps_url": "https://www.google.com/maps/?cid=2371638427654357732",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/fatmawati",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=2371638427654357732",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-gajah-mada",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1438979%2C106.8152194",
    "google_maps_url": "https://www.google.com/maps/?cid=14378154410818950400",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/gajah-mada",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=14378154410818950400",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-gandaria",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2442352%2C106.7814814",
    "google_maps_url": "https://www.google.com/maps/?cid=3724455855292885730",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/gandaria",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=3724455855292885730",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-greenville",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1637497%2C106.7729975",
    "google_maps_url": "https://www.google.com/maps/?cid=14779837283470711283",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/greenville",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=14779837283470711283",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-grogol",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1647816%2C106.789537",
    "google_maps_url": "https://www.google.com/maps/?cid=11326213915927908111",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/grogol",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=11326213915927908111",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-itc-kuningan",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2238828%2C106.8266834",
    "google_maps_url": "https://www.google.com/maps/?cid=11846979902265813166",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/itc-kuningan",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=11846979902265813166",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-itc-permata-hijau",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2213216%2C106.7840509",
    "google_maps_url": "https://www.google.com/maps/?cid=12249288082222888626",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/itc-permata-hijau",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=12249288082222888626",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-jagakarsa",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.3321438%2C106.8074926",
    "google_maps_url": "https://www.google.com/maps/?cid=18247801396652719417",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/jagakarsa",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=18247801396652719417",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-jakarta-garden-city",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1713298%2C106.9594933",
    "google_maps_url": "https://www.google.com/maps/?cid=7143181484633110233",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/jakarta-garden-city",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=7143181484633110233",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-kalimalang",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2490633%2C106.9406973",
    "google_maps_url": "https://www.google.com/maps/?cid=13371055143142912440",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/kalimalang",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=13371055143142912440",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-kemang",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2630899%2C106.8158171",
    "google_maps_url": "https://www.google.com/maps/?cid=18086143917419094371",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/kemang",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=18086143917419094371",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-kemanggisan",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2104434%2C106.7755624",
    "google_maps_url": "https://www.google.com/maps/?cid=4543861424677177793",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/kemanggisan",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4543861424677177793",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-mampang",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2495298%2C106.8267596",
    "google_maps_url": "https://www.google.com/maps/?cid=13135715944027127047",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/mampang",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=13135715944027127047",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-maspion-plaza",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1411447%2C106.8338311",
    "google_maps_url": "https://www.google.com/maps/?cid=312802165837802039",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/maspion-plaza",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=312802165837802039",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-meruya",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1980817%2C106.7455331",
    "google_maps_url": "https://www.google.com/maps/?cid=16098018459745036637",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/meruya",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=16098018459745036637",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-pasar-minggu",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2516112%2C106.8428887",
    "google_maps_url": "https://www.google.com/maps/?cid=17721050205947844530",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/pasar-minggu",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=17721050205947844530",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-plaza-oleos",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2972511%2C106.8294916",
    "google_maps_url": "https://www.google.com/maps/?cid=4033637631174034879",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/pasar-minggu/fit-hub-plaza-oleos-pasa-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4033637631174034879",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-pluit",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1180293%2C106.7850065",
    "google_maps_url": "https://www.google.com/maps/?cid=4337491061151512293",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/pluit",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4337491061151512293",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-puri-indah",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1878826%2C106.7353694",
    "google_maps_url": "https://www.google.com/maps/?cid=9060825270789600972",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/puri-indah",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=9060825270789600972",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-rawamangun",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1939044%2C106.8949267",
    "google_maps_url": "https://www.google.com/maps/?cid=5361158859457381873",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/rawamangun",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=5361158859457381873",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-salemba",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1975365%2C106.8522644",
    "google_maps_url": "https://www.google.com/maps/?cid=520456630750933342",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/salemba",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=520456630750933342",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-sedayu-city",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1658119%2C106.9247889",
    "google_maps_url": "https://www.google.com/maps/?cid=9429231536487244838",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/sedayu-city",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=9429231536487244838",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-sintesa-menara-duta",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.208976%2C106.829227",
    "google_maps_url": "https://www.google.com/maps/?cid=7884399157770433644",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/sintesa-menara-duta",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=7884399157770433644",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-sunter-altira",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.152046%2C106.88609",
    "google_maps_url": "https://www.google.com/maps/?cid=17538190836396610114",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/sunter-altira",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=17538190836396610114",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-taman-palem-lestari",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1379075%2C106.724676",
    "google_maps_url": "https://www.google.com/maps/?cid=8103257900012820330",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/taman-palem-lestari",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=8103257900012820330",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-tamini-square",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2917244%2C106.8815173",
    "google_maps_url": "https://www.google.com/maps/?cid=13574855099649820064",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/tamini-square",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=13574855099649820064",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-tebet",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2330222%2C106.8447124",
    "google_maps_url": "https://www.google.com/maps/?cid=11820843146337996596",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/tebet",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=11820843146337996596",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fithub-wisma-bni-46",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2034773%2C106.8204207",
    "google_maps_url": "https://www.google.com/maps/?cid=3038561570092675302",
    "sources": [
      {
        "url": "https://fithub.id/location/jakarta/wisma-bni-46",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=3038561570092675302",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-grand-indonesia",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1966988%2C106.8224847",
    "google_maps_url": "https://www.google.com/maps/?cid=1241475274734468741",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/zLYYsCEo917Jtpru6",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=1241475274734468741",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-kemang-village",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2609819%2C106.8122371",
    "google_maps_url": "https://www.google.com/maps/?cid=15208787968364492895",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/45BF81yhe1QZAJ8M7",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=15208787968364492895",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-lotte-mall-jakarta",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2242708%2C106.8240493",
    "google_maps_url": "https://www.google.com/maps/?cid=15327589365414719839",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/JA6qst8jv8JLVLEL7",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=15327589365414719839",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-mall-taman-anggrek",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1788017%2C106.7927627",
    "google_maps_url": "https://www.google.com/maps/?cid=8805375342171880884",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/DFUYy9qRtPWCFfXE7",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=8805375342171880884",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-oakwood-mega-kuningan",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2279902%2C106.8256241",
    "google_maps_url": "https://www.google.com/maps/?cid=14431822818413742744",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/N7xoVaLqqtjzN7uE9",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=14431822818413742744",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-pacific-place",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2245525%2C106.8101396",
    "google_maps_url": "https://www.google.com/maps/?cid=10751768682495323058",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/t8bFBRnG99SFQg8eA",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=10751768682495323058",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-pejaten-village",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2800683%2C106.8293487",
    "google_maps_url": "https://www.google.com/maps/?cid=11787115661413889952",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/d8dEVyak6UGRSmmT8",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=11787115661413889952",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-senayan-city",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2276752%2C106.7974284",
    "google_maps_url": "https://www.google.com/maps/?cid=9370032165462217596",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/2cT75sJwCTCVE6eEA",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=9370032165462217596",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-st-moritz",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1884767%2C106.7386365",
    "google_maps_url": "https://www.google.com/maps/?cid=8289883060604298198",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/FffPQy2WLrv3RcHb9",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=8289883060604298198",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-agora",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1987901%2C106.8218375",
    "google_maps_url": "https://www.google.com/maps/?cid=3030743146221522694",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/xgXemArBwNK6Qz4SA",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=3030743146221522694",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-arjuna-utara",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1849145%2C106.7834866",
    "google_maps_url": "https://www.google.com/maps/?cid=16308151668487287231",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/Wh6XPvNWr9S1Dfc46",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=16308151668487287231",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-bendungan-hilir",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2086843%2C106.8120209",
    "google_maps_url": "https://www.google.com/maps/?cid=11057573911163973610",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/uBG3jbwyGzijQmfE9",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=11057573911163973610",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-blok-m",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2426794%2C106.7994013",
    "google_maps_url": "https://www.google.com/maps/?cid=9509634878855256086",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/Vq77aiZLscDmWwkr7",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=9509634878855256086",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-citra-garden",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1434078%2C106.6982775",
    "google_maps_url": "https://www.google.com/maps/?cid=14469601825532629572",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/ehmuhGyQjEzRyQpE8",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=14469601825532629572",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-gading-sunter",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1535582%2C106.8864547",
    "google_maps_url": "https://www.google.com/maps/?cid=4908737303233342459",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/nfkBNb5gncFqvLNZ8",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4908737303233342459",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-gandaria",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2430088%2C106.7877195",
    "google_maps_url": "https://www.google.com/maps/?cid=1961879421056967450",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/7KDa6pSWGUnUsZNF9",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=1961879421056967450",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-green-garden",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1652307%2C106.7626968",
    "google_maps_url": "https://www.google.com/maps/?cid=7763136767854369464",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/mh7CkkKaG3yE7mwH9",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=7763136767854369464",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-gunung-sahari",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.14007%2C106.83336",
    "google_maps_url": "https://www.google.com/maps/?cid=3974129975162623615",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/6Z7QXn6knU5JfUvP6",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=3974129975162623615",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-kebon-sirih",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.183565%2C106.82814",
    "google_maps_url": "https://www.google.com/maps/?cid=16158140256737146041",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/oYDHU5jFZSdZrisN8",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=16158140256737146041",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-kemanggisan",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1986931%2C106.7820129",
    "google_maps_url": "https://www.google.com/maps/?cid=3232248401408014089",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/vAE3NEanA2f8Depy8",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=3232248401408014089",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-mampang",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2495171%2C106.8260697",
    "google_maps_url": "https://www.google.com/maps/?cid=16806278859894474600",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/yseGTHPa17ZFyttWA",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=16806278859894474600",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-menteng",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1877917%2C106.8252638",
    "google_maps_url": "https://www.google.com/maps/?cid=16220656802020427403",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/X3NM4vy3KvpUTzrS9",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=16220656802020427403",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-pasar-minggu",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2865943%2C106.8435514",
    "google_maps_url": "https://www.google.com/maps/?cid=12404937338800650393",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/ujrifzRVdY4CXgQo8",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=12404937338800650393",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-permata-hijau",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.21285%2C106.7726149",
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=FTL%20Gym%20Permata%20Hijau%20Jl.%20Panjang%20Raya%2C%20Desa%2FKelurahan%20Sukabumi%20Utara%2C%20Kec.%20Kebon%20Jeruk%2C%20Kota%20Adm.%20Jakarta%20Barat%2C%20Provinsi%20DKI%20Jakarta%2C%2011540",
    "sources": []
  },
  {
    "id": "jakarta-ftl-pondok-bambu",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2183871%2C106.9000718",
    "google_maps_url": "https://www.google.com/maps/?cid=16259299078234283063",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/HpDVwfzYQ7zAvDj49",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=16259299078234283063",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-pondok-indah",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2701568%2C106.7749136",
    "google_maps_url": "https://www.google.com/maps/?cid=4558131960973002719",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/3YG1u81A3t4eYP2G8",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=4558131960973002719",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-puri",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1887766%2C106.7415967",
    "google_maps_url": "https://www.google.com/maps/?cid=15346188080624796424",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/tVmgU3sj1GuQ5mxj6",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=15346188080624796424",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-rawamangun",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1932086%2C106.8959759",
    "google_maps_url": "https://www.google.com/maps/?cid=7065184072223275908",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/bMkC9FK81K5niYau5",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=7065184072223275908",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-satrio",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2184726%2C106.8197403",
    "google_maps_url": "https://www.google.com/maps/?cid=15964596636279567281",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/yscZLrdTH55mthD67",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=15964596636279567281",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-scbd",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2262888%2C106.8071618",
    "google_maps_url": "https://www.google.com/maps/?cid=5255653692121146596",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/oJc7fvVgWAe2uYHF6",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=5255653692121146596",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-tanjung-duren",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1739627%2C106.7855181",
    "google_maps_url": "https://www.google.com/maps/?cid=7671605880709219589",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/2z5j1enfSavTyzsF7",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=7671605880709219589",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-tebet",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.226542%2C106.8546583",
    "google_maps_url": "https://www.google.com/maps/?cid=12876543904099726228",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/AYT7WczFsNPgK34a8",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=12876543904099726228",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-ftl-tomang",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1765367%2C106.8012897",
    "google_maps_url": "https://www.google.com/maps/?cid=10025764562831685207",
    "sources": [
      {
        "url": "https://maps.app.goo.gl/frxEcngyXmYiR9vFA",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=10025764562831685207",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-gbk-gate-vii",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.21728%2C106.803549",
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=GBK%20Gate%20VII%20%E2%80%94%20Calisthenics%20Area%20Stadion%20Utama%20Gelora%20Bung%20Karno%2C%20Jl.%20Lingkar%20Stadion%2C%20RW.01%2C%20Gelora%2C%20Kec.%20Tanah%20Abang%2C%20Jakarta%20Pusat%2010270",
    "sources": []
  },
  {
    "id": "jakarta-gbk-monkey-bar",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2170589%2C106.802196",
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=GBK%20Jalan%20Lingkar%20Stadion%20%E2%80%94%20Monkey%20Bar%20Area%20Stadion%20Utama%20Gelora%20Bung%20Karno%2C%20Jl.%20Lingkar%20Stadion%2C%20RW.01%2C%20Gelora%2C%20Kec.%20Tanah%20Abang%2C%20Jakarta%20Pusat%2010270",
    "sources": []
  },
  {
    "id": "jakarta-hm-fitness-ulujami",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2452376%2C106.7672024",
    "google_maps_url": "https://www.google.com/maps/?cid=16374828486325887479",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-selatan/pesanggrahan/h-m-fitness-center-pesa-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=16374828486325887479",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-new-friendly-gym-lubang-buaya",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2860267%2C106.9046032",
    "google_maps_url": "https://www.google.com/maps/?cid=18309300188584580394",
    "sources": [
      {
        "url": "https://caribisnis.id/gym-fitness/jakarta-timur/cipayung/new-friendly-gym-cipa-imp1",
        "kind": "publisher",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=18309300188584580394",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  },
  {
    "id": "jakarta-tebet-eco-park",
    "previous_google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2372018%2C106.8528973",
    "google_maps_url": "https://www.google.com/maps/?cid=9472035101936366172",
    "sources": [
      {
        "url": "https://tebetecopark.jakarta.go.id/v144/t101/informasi",
        "kind": "operator",
        "fields": [
          "identity",
          "location"
        ]
      },
      {
        "url": "https://www.google.com/maps/?cid=9472035101936366172",
        "kind": "map",
        "fields": [
          "identity",
          "location"
        ]
      }
    ]
  }
]
$place_map_links$::jsonb;
BEGIN
IF EXISTS (
  SELECT 1 FROM place_catalog AS place
  JOIN jsonb_to_recordset(links) AS seed (
    id text, previous_google_maps_url text, google_maps_url text
  ) ON place.id = seed.id
  WHERE place.google_maps_url = seed.previous_google_maps_url
    AND place.google_maps_url IS DISTINCT FROM seed.google_maps_url
) THEN
UPDATE place_catalog AS place
SET google_maps_url = seed.google_maps_url,
    sources = place.sources || COALESCE((
      SELECT jsonb_agg(candidate.value)
      FROM jsonb_array_elements(seed.sources) AS candidate(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(place.sources) AS existing(value)
        WHERE existing.value->>'url' = candidate.value->>'url'
      )
    ), '[]'::jsonb)
FROM jsonb_to_recordset(links) AS seed (
  id text, previous_google_maps_url text, google_maps_url text, sources jsonb
)
WHERE place.id = seed.id
  AND place.google_maps_url = seed.previous_google_maps_url
  AND place.google_maps_url IS DISTINCT FROM seed.google_maps_url;
END IF;
END
$maps_migration$;
