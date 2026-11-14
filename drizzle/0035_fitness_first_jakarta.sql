-- Nine Fitness First branches requested by the owner, checked 2026-11-14.
-- Opening hours follow the supplied screenshot, including Oakwood Sunday/PH closure.
-- Coordinates are venue pins linked by the official club pages. Keep existing IDs/favorites.
INSERT INTO place_catalog (id, name, mode, gym_category, brand, access_model, day_pass_available, area, city, address, latitude, longitude, google_maps_url, sources, checked_at, opening_hours)
SELECT id, name, mode::training_mode, gym_category, brand, access_model,
  day_pass_available, area, city, address, latitude, longitude, google_maps_url,
  sources, checked_at, opening_hours
FROM jsonb_to_recordset($fitness_first$
[
  {
    "id": "jakarta-fitness-first-grand-indonesia",
    "name": "Fitness First Grand Indonesia",
    "mode": "gym",
    "gym_category": "brand",
    "brand": "fitness_first",
    "access_model": "membership",
    "day_pass_available": null,
    "area": "Jakarta",
    "city": "Jakarta Pusat",
    "address": "Grand Indonesia, Menara BCA Lantai 11, Jl. MH Thamrin, No. 1, Kota Jakarta Pusat, 10310 Daerah Khusus Ibukota Jakarta, Indonesia",
    "latitude": -6.1966988,
    "longitude": 106.8224847,
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1966988%2C106.8224847",
    "sources": [
      {
        "url": "https://www.fitnessfirst.com/id/en/clubs/grand-indonesia",
        "kind": "operator",
        "fields": [
          "identity",
          "location",
          "access"
        ]
      },
      {
        "url": "https://maps.app.goo.gl/zLYYsCEo917Jtpru6",
        "kind": "map",
        "fields": [
          "location"
        ]
      }
    ],
    "checked_at": "2026-11-14",
    "opening_hours": [
      {
        "labelID": "Senin - Jumat",
        "labelEN": "Monday - Friday",
        "hours": "06.00 - 22.30"
      },
      {
        "labelID": "Sabtu",
        "labelEN": "Saturday",
        "hours": "06.00 - 21.30"
      },
      {
        "labelID": "Minggu / Libur Nasional",
        "labelEN": "Sunday / Public Holidays",
        "hours": "08.00 - 20.00"
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-senayan-city",
    "name": "Fitness First Senayan City",
    "mode": "gym",
    "gym_category": "brand",
    "brand": "fitness_first",
    "access_model": "membership",
    "day_pass_available": null,
    "area": "Jakarta",
    "city": "Jakarta Pusat",
    "address": "Senayan City, Senayan City 6th floor, Jl. Asia Afrika Lot 19, Jakarta Selatan, 10270 Daerah Khusus Ibukota Jakarta, Indonesia",
    "latitude": -6.2276752,
    "longitude": 106.7974284,
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2276752%2C106.7974284",
    "sources": [
      {
        "url": "https://www.fitnessfirst.com/id/en/clubs/senayan-city",
        "kind": "operator",
        "fields": [
          "identity",
          "location",
          "access"
        ]
      },
      {
        "url": "https://maps.app.goo.gl/2cT75sJwCTCVE6eEA",
        "kind": "map",
        "fields": [
          "location"
        ]
      }
    ],
    "checked_at": "2026-11-14",
    "opening_hours": [
      {
        "labelID": "Senin - Jumat",
        "labelEN": "Monday - Friday",
        "hours": "06.00 - 22.00"
      },
      {
        "labelID": "Sabtu",
        "labelEN": "Saturday",
        "hours": "06.00 - 21.30"
      },
      {
        "labelID": "Minggu / Libur Nasional",
        "labelEN": "Sunday / Public Holidays",
        "hours": "08.00 - 20.00"
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-pacific-place",
    "name": "Fitness First Pacific Place",
    "mode": "gym",
    "gym_category": "brand",
    "brand": "fitness_first",
    "access_model": "membership",
    "day_pass_available": null,
    "area": "Jakarta",
    "city": "Jakarta Selatan",
    "address": "Pacific Place Mall, Pacific Place 5th Floor, Jl. Jendral Sudirman Kav 52-53, 12190, Jakarta Selatan, Indonesia",
    "latitude": -6.2245525,
    "longitude": 106.8101396,
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2245525%2C106.8101396",
    "sources": [
      {
        "url": "https://www.fitnessfirst.com/id/en/clubs/pacific-place",
        "kind": "operator",
        "fields": [
          "identity",
          "location",
          "access"
        ]
      },
      {
        "url": "https://maps.app.goo.gl/t8bFBRnG99SFQg8eA",
        "kind": "map",
        "fields": [
          "location"
        ]
      }
    ],
    "checked_at": "2026-11-14",
    "opening_hours": [
      {
        "labelID": "Senin - Jumat",
        "labelEN": "Monday - Friday",
        "hours": "06.00 - 22.30"
      },
      {
        "labelID": "Sabtu",
        "labelEN": "Saturday",
        "hours": "06.00 - 21.30"
      },
      {
        "labelID": "Minggu / Libur Nasional",
        "labelEN": "Sunday / Public Holidays",
        "hours": "08.00 - 20.00"
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-mall-taman-anggrek",
    "name": "Fitness First Mall Taman Anggrek",
    "mode": "gym",
    "gym_category": "brand",
    "brand": "fitness_first",
    "access_model": "membership",
    "day_pass_available": null,
    "area": "Jakarta",
    "city": "Jakarta Barat",
    "address": "Mall Taman Anggrek, Mall Taman Anggrek 5th & 6th Floor, Jl. S Parman Kav. 21, 11470 Daerah Khusus Ibukota Jakarta, Indonesia",
    "latitude": -6.1788017,
    "longitude": 106.7927627,
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1788017%2C106.7927627",
    "sources": [
      {
        "url": "https://www.fitnessfirst.com/id/en/clubs/mall-taman-anggrek",
        "kind": "operator",
        "fields": [
          "identity",
          "location",
          "access"
        ]
      },
      {
        "url": "https://maps.app.goo.gl/DFUYy9qRtPWCFfXE7",
        "kind": "map",
        "fields": [
          "location"
        ]
      }
    ],
    "checked_at": "2026-11-14",
    "opening_hours": [
      {
        "labelID": "Senin - Jumat",
        "labelEN": "Monday - Friday",
        "hours": "06.00 - 22.00"
      },
      {
        "labelID": "Sabtu",
        "labelEN": "Saturday",
        "hours": "06.00 - 21.30"
      },
      {
        "labelID": "Minggu / Libur Nasional",
        "labelEN": "Sunday / Public Holidays",
        "hours": "08.00 - 20.00"
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-pejaten-village",
    "name": "Fitness First Pejaten Village",
    "mode": "gym",
    "gym_category": "brand",
    "brand": "fitness_first",
    "access_model": "membership",
    "day_pass_available": null,
    "area": "Jakarta",
    "city": "Jakarta Selatan",
    "address": "Pejaten Village, Jl. Warung Jati Barat, No.39, Jati Padang, Ps. Minggu, Kota Jakarta Selatan, 12510 Daerah Khusus Ibukota Jakarta, Indonesia",
    "latitude": -6.2800683,
    "longitude": 106.8293487,
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2800683%2C106.8293487",
    "sources": [
      {
        "url": "https://www.fitnessfirst.com/id/en/clubs/pejaten-village",
        "kind": "operator",
        "fields": [
          "identity",
          "location",
          "access"
        ]
      },
      {
        "url": "https://maps.app.goo.gl/d8dEVyak6UGRSmmT8",
        "kind": "map",
        "fields": [
          "location"
        ]
      }
    ],
    "checked_at": "2026-11-14",
    "opening_hours": [
      {
        "labelID": "Senin - Jumat",
        "labelEN": "Monday - Friday",
        "hours": "06.00 - 22.30"
      },
      {
        "labelID": "Sabtu",
        "labelEN": "Saturday",
        "hours": "06.00 - 21.30"
      },
      {
        "labelID": "Minggu / Libur Nasional",
        "labelEN": "Sunday / Public Holidays",
        "hours": "08.00 - 20.00"
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-lotte-mall-jakarta",
    "name": "Fitness First Lotte Mall Jakarta",
    "mode": "gym",
    "gym_category": "brand",
    "brand": "fitness_first",
    "access_model": "membership",
    "day_pass_available": null,
    "area": "Jakarta",
    "city": "Jakarta Selatan",
    "address": "Ciputra World Jakarta 1 - Marketing Gallery, Lotte Shopping Avenue, 3rd Floor, Jl. Prof. Dr. Satrio Kav 3 – 5, 12940 Karet Kuningan, Indonesia",
    "latitude": -6.2242708,
    "longitude": 106.8240493,
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2242708%2C106.8240493",
    "sources": [
      {
        "url": "https://www.fitnessfirst.com/id/en/clubs/lotte-shopping-avenue",
        "kind": "operator",
        "fields": [
          "identity",
          "location",
          "access"
        ]
      },
      {
        "url": "https://maps.app.goo.gl/JA6qst8jv8JLVLEL7",
        "kind": "map",
        "fields": [
          "location"
        ]
      }
    ],
    "checked_at": "2026-11-14",
    "opening_hours": [
      {
        "labelID": "Senin - Jumat",
        "labelEN": "Monday - Friday",
        "hours": "06.00 - 22.00"
      },
      {
        "labelID": "Sabtu",
        "labelEN": "Saturday",
        "hours": "06.00 - 21.00"
      },
      {
        "labelID": "Minggu / Libur Nasional",
        "labelEN": "Sunday / Public Holidays",
        "hours": "08.00 - 20.00"
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-kemang-village",
    "name": "Fitness First Kemang Village",
    "mode": "gym",
    "gym_category": "brand",
    "brand": "fitness_first",
    "access_model": "membership",
    "day_pass_available": null,
    "area": "Jakarta",
    "city": "Jakarta Selatan",
    "address": "Lippo Mall Kemang, Lt. 3, Jalan Pangeran Antasari No.36P, 12950 Daerah Khusus Ibukota Jakarta, Indonesia",
    "latitude": -6.2609819,
    "longitude": 106.8122371,
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2609819%2C106.8122371",
    "sources": [
      {
        "url": "https://www.fitnessfirst.com/id/en/clubs/kemang-village",
        "kind": "operator",
        "fields": [
          "identity",
          "location",
          "access"
        ]
      },
      {
        "url": "https://maps.app.goo.gl/45BF81yhe1QZAJ8M7",
        "kind": "map",
        "fields": [
          "location"
        ]
      }
    ],
    "checked_at": "2026-11-14",
    "opening_hours": [
      {
        "labelID": "Senin - Jumat",
        "labelEN": "Monday - Friday",
        "hours": "06.00 - 21.00"
      },
      {
        "labelID": "Sabtu",
        "labelEN": "Saturday",
        "hours": "06.00 - 21.00"
      },
      {
        "labelID": "Minggu / Libur Nasional",
        "labelEN": "Sunday / Public Holidays",
        "hours": "08.00 - 20.00"
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-st-moritz",
    "name": "Fitness First St. Moritz",
    "mode": "gym",
    "gym_category": "brand",
    "brand": "fitness_first",
    "access_model": "membership",
    "day_pass_available": null,
    "area": "Jakarta",
    "city": "Jakarta Barat",
    "address": "St. Moritz Level 2, Mall 2, Jl. Puri Indah Raya Blok U 1, 11610 Puri Indah CBD, Jakarta, Indonesia",
    "latitude": -6.1884767,
    "longitude": 106.7386365,
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.1884767%2C106.7386365",
    "sources": [
      {
        "url": "https://www.fitnessfirst.com/id/en/clubs/st-moritz",
        "kind": "operator",
        "fields": [
          "identity",
          "location",
          "access"
        ]
      },
      {
        "url": "https://maps.app.goo.gl/FffPQy2WLrv3RcHb9",
        "kind": "map",
        "fields": [
          "location"
        ]
      }
    ],
    "checked_at": "2026-11-14",
    "opening_hours": [
      {
        "labelID": "Senin - Jumat",
        "labelEN": "Monday - Friday",
        "hours": "06.00 - 22.00"
      },
      {
        "labelID": "Sabtu",
        "labelEN": "Saturday",
        "hours": "06.00 - 21.00"
      },
      {
        "labelID": "Minggu / Libur Nasional",
        "labelEN": "Sunday / Public Holidays",
        "hours": "08.00 - 20.00"
      }
    ]
  },
  {
    "id": "jakarta-fitness-first-oakwood-mega-kuningan",
    "name": "Fitness First Oakwood Mega Kuningan",
    "mode": "gym",
    "gym_category": "brand",
    "brand": "fitness_first",
    "access_model": "membership",
    "day_pass_available": null,
    "area": "Jakarta",
    "city": "Jakarta Selatan",
    "address": "Oakwood Apartment 2nd Floor, Jl. Lingkar, 10950 Mega Kuningan Jakarta Pusat, Indonesia",
    "latitude": -6.2279902,
    "longitude": 106.8256241,
    "google_maps_url": "https://www.google.com/maps/search/?api=1&query=-6.2279902%2C106.8256241",
    "sources": [
      {
        "url": "https://www.fitnessfirst.com/id/en/clubs/oakwood",
        "kind": "operator",
        "fields": [
          "identity",
          "location",
          "access"
        ]
      },
      {
        "url": "https://maps.app.goo.gl/N7xoVaLqqtjzN7uE9",
        "kind": "map",
        "fields": [
          "location"
        ]
      }
    ],
    "checked_at": "2026-11-14",
    "opening_hours": [
      {
        "labelID": "Senin - Jumat",
        "labelEN": "Monday - Friday",
        "hours": "06.00 - 22.00"
      },
      {
        "labelID": "Sabtu",
        "labelEN": "Saturday",
        "hours": "07.00 - 21.00"
      },
      {
        "labelID": "Minggu / Libur Nasional",
        "labelEN": "Sunday / Public Holidays",
        "hours": "Tutup"
      }
    ]
  }
]
$fitness_first$::jsonb) AS seed (
  id text, name text, mode text, gym_category text, brand text, access_model text,
  day_pass_available boolean, area text, city text, address text, latitude numeric,
  longitude numeric, google_maps_url text, sources jsonb, checked_at date, opening_hours jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  city = EXCLUDED.city,
  address = EXCLUDED.address,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  google_maps_url = EXCLUDED.google_maps_url,
  sources = EXCLUDED.sources,
  checked_at = EXCLUDED.checked_at,
  opening_hours = EXCLUDED.opening_hours
WHERE (place_catalog.name, place_catalog.city, place_catalog.address, place_catalog.latitude, place_catalog.longitude, place_catalog.google_maps_url, place_catalog.sources, place_catalog.checked_at, place_catalog.opening_hours)
  IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.city, EXCLUDED.address, EXCLUDED.latitude, EXCLUDED.longitude, EXCLUDED.google_maps_url, EXCLUDED.sources, EXCLUDED.checked_at, EXCLUDED.opening_hours);
