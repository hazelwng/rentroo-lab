# rentroo-lab

Compare Tokyo apartment listings by two dimensions: the weekday commute and
how much direct sun a room gets on the shortest day of the year.

```text
backend/   FastAPI: commute + sunlight APIs, CSA engine, PLATEAU seed script
web/       Next.js: listing tabs, MapLibre maps, Three.js room view
cities/    data: Greater Tokyo rail timetable, extracted Meguro buildings
```

## Commute

A Connection Scan Algorithm (CSA) engine over a compiled Mini Tokyo 3D weekday
snapshot: 179 railway lines, 2,583 located stops, and 588,859 train movements.
The feed and route indexes are loaded once per backend process and reused by
later commute requests.

```text
Mini Tokyo 3D static data
→ weekday trips
→ atomic timetable connections
→ explicit interchange footpaths
→ CSA scans
→ route options: fastest / fewest transfers / least walking
→ FastAPI
→ Next.js + MapLibre route map
```

The engine also implements reverse (arrive-by) scans; they are tested but not
yet exposed in the UI.

## Sunlight

Every building becomes a simple block: its roof outline from PLATEAU CityGML,
pulled up to its surveyed height (estimated from storey count when missing).
One ward (89,625 buildings) fits in a 3.6 MB file. The simulation then
traces sun rays to the window through the day (73 times × 3 window heights)
and reports which stretches stay lit, in ~11 ms.

```text
PLATEAU CityGML
→ LOD0 footprint + height + ground per building
→ compressed 2.5D prism model
→ local metre projection
→ solar ray casting on the winter solstice
→ FastAPI
→ MapLibre top view + Three.js room view
```

## Scope

- Transit uses a pinned weekday timetable snapshot; it does not model live
  delays, service changes, or weekend schedules.
- Sunlight covers Meguro ward and always uses the winter solstice.
- Buildings are prisms, not meshes; access/egress walks are straight-line
  estimates. Results are apartment-research estimates, not daylight
  certification.

Dataset sources, licensing, and regeneration notes:
[`cities/tokyo/README.md`](cities/tokyo/README.md).

## Roadmap

- Show the routing algorithm at work: an animation on the map of how far you
  can get as time passes.
- Sunlight for spring and summer.
- "Arrive by 9:00" search: when is the latest you can leave home?
- Cover more Tokyo wards with sunlight and walk-home data.
- A link you can send to a friend to show them your comparison.

## Run locally

```bash
./roo test    # backend test suite
./roo lint    # Ruff lint and format checks
./roo serve   # FastAPI at http://localhost:8000
./roo web     # Next.js at http://localhost:3000
```

Run `./roo help` to see the available development commands.
