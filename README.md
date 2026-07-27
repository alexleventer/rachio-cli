# rachio-cli — control your Rachio sprinklers from the command line

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](#install)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](#development)

A fast, scriptable **command-line interface for the [Rachio](https://rachio.com) smart sprinkler
controller**. Start and stop zones, set rain delays, run schedules, and check what's watering right
now — without opening the Rachio app. Written in TypeScript on the official
[Rachio public API](https://rachio.readme.io/), with `--json` output on every command so it drops
straight into shell scripts, cron jobs, and home-automation pipelines.

```console
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

**Contents** — [Install](#install) · [Authentication](#authentication) · [Commands](#commands) ·
[Watering zones](#watering-zones) · [Rain delay and standby](#rain-delay-and-standby) ·
[Schedules](#schedules) · [Scripting with JSON](#scripting-with-json) · [Automation examples](#automation-examples) ·
[FAQ](#faq)

## Features

- **Water any zone by name or number** — `rachio water "Front Lawn"` or `rachio water 3`
- **Run multiple zones in sequence** with per-zone durations in one command
- **Rain delay** — set, inspect, and clear without the app
- **Standby mode** — stop all schedules from running, then re-enable
- **Run or skip a schedule** on demand, plus seasonal adjustment
- **Live watering status** — which zone, how much time is left, manual vs. scheduled
- **Event history** for recent controller activity
- **JSON output everywhere** for `jq`, cron, Home Assistant shell commands, and CI
- **No dependencies beyond `commander`** — small install, no Python runtime

## Install

```bash
git clone git@github.com:alexleventer/rachio-cli.git
cd rachio-cli
npm install
npm run build
npm link          # puts `rachio` on your PATH
```

Requires **Node.js 20 or newer**. Works on macOS, Linux, and WSL.

## Authentication

Get a Rachio API key from [app.rach.io](https://app.rach.io) → **Account Settings** → **Get API Key**,
then:

```bash
rachio auth login          # prompts without echoing the token
```

The token is verified against the Rachio API *before* it's saved, so a bad paste fails immediately
rather than on your next command. It's stored in `~/.config/rachio/config.json` with mode `0600`.

Set `RACHIO_API_TOKEN` in the environment to override the stored token — useful for scripts, cron,
and CI where you don't want a config file on disk.

```bash
rachio auth status         # who am I authenticated as?
rachio auth logout         # remove stored credentials
```

## Commands

| Command | Description |
| --- | --- |
| `rachio status` | Controller state and what's watering right now |
| `rachio devices` | List Rachio controllers on the account |
| `rachio zones [--all]` | List zones (`--all` includes disabled ones) |
| `rachio zone <zone>` | Zone details — nozzle, soil type, last watered |
| `rachio water <zone...>` | Start one or more zones |
| `rachio stop` | Stop all watering immediately |
| `rachio pause` / `rachio resume` | Pause and resume the running zone |
| `rachio rain-delay [hours]` | Show, set, or clear a rain delay |
| `rachio on` / `rachio off` | Leave or enter standby mode |
| `rachio enable <zone>` / `rachio disable <zone>` | Enable or disable a zone |
| `rachio schedules` | List fixed and Flex schedules |
| `rachio schedule run\|skip\|adjust` | Act on a schedule |
| `rachio events` | Recent controller events |

Run `rachio --help` or `rachio <command> --help` for full options.

## Watering zones

```bash
rachio water 3 --minutes 15         # zone 3 for 15 minutes
rachio water "Front Lawn"           # by name (default 10 minutes)
rachio water 1 2 3 -m 5             # three zones, 5 min each, run in order
rachio water 1:10 4:20 "Beds":5     # per-zone durations
rachio stop                         # stop everything
rachio pause -m 20                  # pause the running zone (max 60 min)
rachio resume
```

Zones can be addressed by **number**, **name** (case-insensitive, partial matches allowed), or id.
An ambiguous name is an error that lists the candidates rather than a silent guess — `"lawn"`
matching both *Front Lawn* and *Back Lawn* is a mistake you want loud, not silent.

Multiple zones are batched into a single API call and run **in the order you list them**, matching
how the Rachio app queues a manual run.

## Rain delay and standby

```bash
rachio rain-delay          # show the current delay, if any
rachio rain-delay 24       # skip watering for 24 hours (max 168)
rachio rain-delay clear

rachio off                 # standby — schedules stop running
rachio on                  # back to active
```

## Schedules

```bash
rachio schedules                       # list all schedules
rachio schedule run "Morning Water"    # start a fixed schedule now
rachio schedule skip "Morning Water"   # skip its next run
rachio schedule adjust "Morning" -20   # seasonal adjustment, -100..100 (%)
```

Flex schedules are listed but can't be started or skipped — the Rachio public API only exposes those
operations for fixed schedules. Water the zones directly instead.

## Multiple controllers

With one Rachio controller everything just works. With several, target one per command or set a
default:

```bash
rachio zones --device "Front Yard"
rachio config set-default-device "Front Yard"
```

`rachio status` reports on every controller unless you pass `--device`.

## Scripting with JSON

Every command accepts `--json` and writes raw JSON to stdout. Errors go to stderr and exit non-zero,
so failures are easy to detect in a script.

```bash
rachio --json status | jq '.[].currentSchedule.zoneId'
rachio --json zones  | jq -r '.[] | select(.enabled) | .name'
```

## Automation examples

**Water the lawn only if it hasn't rained** (paired with any weather source):

```bash
#!/usr/bin/env bash
set -euo pipefail
if [ "$(curl -s "$WEATHER_URL" | jq '.precip_mm')" = "0" ]; then
  rachio water "Front Lawn" "Back Lawn" --minutes 12
fi
```

**Cron: skip tomorrow's schedule when rain is forecast**

```cron
0 20 * * *  /usr/local/bin/rachio rain-delay 24 >> /var/log/rachio.log 2>&1
```

**Alert when a zone is still running late at night**

```bash
zone=$(rachio --json status | jq -r '.[0].currentSchedule.zoneId // empty')
[ -n "$zone" ] && echo "Still watering zone $zone" | mail -s "Rachio" me@example.com
```

## FAQ

### Does Rachio have an official API?

Yes. Rachio publishes a documented REST API at `https://api.rach.io/1/public` with a personal API
key you generate from your account settings. This CLI is a thin, typed client over it. That's a
meaningful contrast with most smart-home CLIs, which reverse-engineer a mobile app.

### Is this an official Rachio product?

No. It's an independent open-source project and isn't affiliated with or endorsed by Rachio.

### Are there rate limits?

The Rachio public API allows **1700 calls per day**. Most commands here cost 2–3 calls. A `429` is
reported as a clear rate-limit error rather than a generic failure.

### What are the watering limits?

A single zone run is capped at 180 minutes, a pause at 60 minutes, and a rain delay at 7 days. The
CLI validates all three before calling the API, so you get an immediate message instead of an opaque
`4xx` and a wasted call against your daily quota.

### Does it work with Smart Hose Timer?

Not currently. Smart Hose Timers live on a separate Rachio API (`cloud-rest.rach.io`) that this CLI
doesn't target yet.

### How does this compare to Home Assistant's Rachio integration?

Home Assistant is the better choice for dashboards, presence-based rules, and long-term history.
This CLI is aimed at the terminal and at shell scripting — one binary, no broker, no daemon, usable
over SSH or from a cron job on any machine.

### Can I use it without installing a config file?

Yes. Set `RACHIO_API_TOKEN` in the environment and the CLI never touches disk.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `RACHIO_API_TOKEN` | API token; overrides the stored config |
| `RACHIO_CONFIG_DIR` | Config file location (default `~/.config/rachio`) |
| `RACHIO_API_URL` | Override the API base URL (used for testing against a mock) |
| `NO_COLOR` | Disable colored output |

## Development

```bash
npm run dev -- status     # run from src/ via Node type stripping, no build step
npm run typecheck
npm run build
```

Layout: `src/api.ts` is a typed wrapper over the REST endpoints, `src/resolve.ts` turns user-facing
names and zone numbers into ids, `src/commands/` holds one module per command group, and
`src/index.ts` wires up the CLI.

Issues and pull requests are welcome.

## License

MIT
