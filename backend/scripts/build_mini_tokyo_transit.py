#!/usr/bin/env python3
"""Compile Mini Tokyo 3D source JSON into Rentroo's deployment bundle."""

from __future__ import annotations

import argparse
from pathlib import Path

from rentroo.transit.mini_tokyo import (
    DEFAULT_CALENDAR,
    load_mini_tokyo_feed,
    load_mini_tokyo_footpaths,
    write_mini_tokyo_bundle,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "data_dir",
        type=Path,
        help="Path to the Mini Tokyo 3D data directory",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Destination .json.gz bundle",
    )
    parser.add_argument("--calendar", default=DEFAULT_CALENDAR)
    parser.add_argument(
        "--source-revision",
        required=True,
        help="Mini Tokyo 3D git commit used to produce the bundle",
    )
    args = parser.parse_args()

    feed = load_mini_tokyo_feed(args.data_dir, calendar=args.calendar)
    footpaths = load_mini_tokyo_footpaths(args.data_dir, feed)
    write_mini_tokyo_bundle(
        args.output,
        feed,
        footpaths,
        calendar=args.calendar,
        source_revision=args.source_revision,
    )

    print(f"Wrote {args.output}")
    print(
        f"{len(feed.stops)} stops, {len(feed.route_names)} routes, "
        f"{len(feed.trip_routes)} trips, {len(feed.connections)} connections, "
        f"{sum(len(edges) for edges in footpaths.values())} footpaths"
    )


if __name__ == "__main__":
    main()
