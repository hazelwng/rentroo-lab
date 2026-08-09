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
