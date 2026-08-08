# rentroo-lab

A rental-research playground: paste listing address, get a commute
report, with latest leave-home time, last train, and the full journey on a map.

Built around a Connection Scan Algorithm (CSA) engine over GTFS transit data.

- **Tokyo commute** — earliest-arrival and latest-departure scans over the
  Tokyo Metro GTFS feed

## Development

```bash
./roo test    # run backend tests
./roo lint    # ruff check + format
```

More commands land as the repo grows — see `./roo help`.
