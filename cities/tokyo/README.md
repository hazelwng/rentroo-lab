# Tokyo

## GTFS feed (`gtfs/`)

Tokyo Metro subway timetable, published by 東京メトロ (Tokyo Metro Co., Ltd.).

- **Source**: redistributed from [mini-tokyo-3d](https://github.com/nagix/mini-tokyo-3d)
  under the MIT license (see `gtfs/LICENSE`). Original data comes from the
  [Public Transportation Open Data Center](https://www.odpt.org/) (ODPT).
- **Coverage**: Tokyo Metro lines only — no JR, Toei, or private railways.
  Good enough for a demo; commutes that would realistically use JR may show
  longer transit times than reality.
- **Validity**: `feed_info.txt` says 2026-03-14 → **2026-12-31**. After the
  end date, calendar lookups return no service — replace the feed before then.
- **Files**: only what the commute engine reads (agency, calendar,
  calendar_dates, feed_info, routes, stops, stop_times, trips). Fare tables
  and translations are stripped to keep the repo small.

### Regenerating

Download a fresh feed from ODPT (free developer registration required) or
from the mini-tokyo-3d data pipeline, drop the eight files above into
`gtfs/`, and check `feed_info.txt` for the new validity window.

## Buildings (`buildings/`)

Building footprints and measured heights for shadow casting, one gzipped
JSON per ward.

- **Source**: 国土交通省 Project PLATEAU 3D都市モデル, 2023年度 CityGML.
  目黒区: <https://www.geospatial.jp/ckan/dataset/plateau-13110-meguro-ku-2023>
- **License**: PLATEAU data is published under the 公共データ利用規約
  (第1.0版), compatible with CC BY 4.0. This directory is a derived work:
  only the LOD0 roof outline and measured height were extracted (see
  `backend/scripts/seed_plateau.py`); everything else was dropped.
  出典：国土交通省 Project PLATEAU（https://www.mlit.go.jp/plateau/）を加工して作成。
- **Coverage**: `meguro.json.gz` holds every building in 目黒区 plus a
  ~300 m buffer of neighbouring wards, since shadows cross ward borders.
- **Heights**: ~5% of PLATEAU buildings carry no measured height (`-9999`);
  those fall back to storeys × 3 m, or 6 m when storeys are missing too.

### Regenerating

Download the ward's CityGML zip from the dataset page above (~300 MB) and run

    cd backend && python scripts/seed_plateau.py <zip> --ward 13110 \
        --out ../cities/tokyo/buildings/meguro.json.gz
