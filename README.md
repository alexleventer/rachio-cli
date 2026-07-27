# rachio-cli

Control your [Rachio](https://rachio.com) smart irrigation controller from the terminal.

```
$ rachio status
● Backyard Controller · GENERATION3_16ZONE
  Controller: online
  Mode:       active
  Watering:   Front Lawn (zone 1)
  Remaining:  6m of 10m
  Source:     manual run

$ rachio water "Front Lawn" --minutes 15
✓ Watering Front Lawn (zone 1) for 15m.
```

## Install

```bash
npm install
npm run build
npm link          # puts `rachio` on your PATH
```

Requires Node 20+.

## Authenticate

Get an API key from [app.rach.io](https://app.rach.io) → **Account Settings** → **Get API Key**, then:

```bash
rachio auth login          # prompts without echoing the token
```

The token is written to `~/.config/rachio/config.json` with mode `0600`. It's verified against the
API before being saved, so a bad paste fails immediately.

`RACHIO_API_TOKEN` in the environment takes precedence over the stored token, which is handy for
scripts and CI.

## Commands

### Status and inspection

| Command | Description |
| --- | --- |
| `rachio status` | Controller state and what's watering right now |
| `rachio devices` | List controllers on the account |
| `rachio zones [--all]` | List zones (add `--all` to include disabled ones) |
| `rachio zone <zone>` | Details for one zone — nozzle, soil, last watered |
| `rachio schedules` | List fixed and Flex schedules |
| `rachio events [--days N] [--limit N]` | Recent controller events |

### Watering

```bash
rachio water 3 --minutes 15         # zone 3 for 15 minutes
rachio water "Front Lawn"           # by name (default 10 minutes)
rachio water 1 2 3 -m 5             # three zones, 5 min each, run in order
rachio water 1:10 4:20 "Beds":5     # per-zone durations
rachio stop                         # stop everything
rachio pause -m 20                  # pause the running zone (max 60 min)
rachio resume
```

Zones are addressed by **number**, **name** (case-insensitive, partial matches allowed), or id.
An ambiguous name is an error listing the candidates rather than a guess.

### Controller state

```bash
rachio rain-delay          # show the current delay
rachio rain-delay 24       # delay watering 24 hours (max 168)
rachio rain-delay clear
rachio off                 # standby — schedules stop running
rachio on                  # back to active
rachio enable "Side Strip"
rachio disable 4
```

### Schedules

```bash
rachio schedule run "Morning Water"    # start a fixed schedule now
rachio schedule skip "Morning Water"   # skip its next run
rachio schedule adjust "Morning" -20   # seasonal adjustment, -100..100 (%)
```

Flex schedules are listed but can't be started or skipped — the Rachio public API only exposes
those operations for fixed schedules.

### Multiple controllers

With one controller everything just works. With several, target one per command or set a default:

```bash
rachio zones --device "Front Yard"
rachio config set-default-device "Front Yard"
```

`rachio status` reports on every controller unless you pass `--device`.

### Scripting

Every command accepts `--json` and emits raw JSON on stdout. Errors go to stderr and exit non-zero.

```bash
rachio --json status | jq '.[].currentSchedule.zoneId'
rachio --json zones | jq -r '.[] | select(.enabled) | .name'
```

## Notes

- The Rachio public API allows **1700 calls per day**. Most commands here cost 2–3 calls
  (`person/info` → `person/:id`, plus the action). A `429` is reported as a rate-limit error.
- A single zone run is capped at 180 minutes, a pause at 60 minutes, and a rain delay at 7 days.
  The CLI validates these before calling the API.
- `RACHIO_API_URL` overrides the API base URL, and `RACHIO_CONFIG_DIR` the config location —
  both are mainly useful for testing against a mock server.

## Development

```bash
npm run dev -- status     # run from src/ via Node's type stripping, no build step
npm run typecheck
npm run build
```

Layout: `src/api.ts` is a typed wrapper over the REST endpoints, `src/resolve.ts` turns
user-facing names and zone numbers into ids, `src/commands/` holds one module per command group,
and `src/index.ts` wires up the CLI.

## License

MIT
