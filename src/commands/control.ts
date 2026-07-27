import { loadAccount, parseZoneArgs, requireClient, selectDevice, selectZone, UserError } from '../resolve.ts';
import { c, formatDate, formatDuration, print, printJson, relativeTime, success, table } from '../output.ts';
import type { GlobalOpts } from './info.ts';
import type { ZoneRunDuration } from '../types.ts';

export async function water(
  zoneArgs: string[],
  opts: GlobalOpts & { minutes?: string },
): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);

  const defaultMinutes = opts.minutes === undefined ? 10 : Number(opts.minutes);
  if (!Number.isFinite(defaultMinutes) || defaultMinutes <= 0) {
    throw new UserError(`--minutes must be a positive number, got "${opts.minutes}".`);
  }

  const runs = parseZoneArgs(device, zoneArgs, defaultMinutes);

  const disabled = runs.filter((r) => !r.zone.enabled);
  if (disabled.length) {
    throw new UserError(
      `These zones are disabled and cannot run: ${disabled.map((r) => r.zone.name).join(', ')}.\n` +
        `  Enable with: rachio enable "${disabled[0]!.zone.name}"`,
    );
  }

  const seen = new Set<string>();
  for (const run of runs) {
    if (seen.has(run.zone.id)) {
      throw new UserError(`Zone "${run.zone.name}" is listed more than once.`);
    }
    seen.add(run.zone.id);
  }

  if (runs.length === 1) {
    const only = runs[0]!;
    await client.startZone(only.zone.id, only.seconds);
  } else {
    const payload: ZoneRunDuration[] = runs.map((run, i) => ({
      id: run.zone.id,
      duration: run.seconds,
      sortOrder: i + 1,
    }));
    await client.startMultipleZones(payload);
  }

  const total = runs.reduce((sum, r) => sum + r.seconds, 0);

  if (opts.json) {
    return printJson({
      started: true,
      device: { id: device.id, name: device.name },
      zones: runs.map((r, i) => ({
        id: r.zone.id,
        name: r.zone.name,
        zoneNumber: r.zone.zoneNumber,
        durationSeconds: r.seconds,
        sortOrder: i + 1,
      })),
      totalSeconds: total,
    });
  }

  if (runs.length === 1) {
    const only = runs[0]!;
    success(
      `Watering ${c.bold(only.zone.name)} (zone ${only.zone.zoneNumber}) for ${c.bold(formatDuration(only.seconds))}.`,
    );
  } else {
    success(`Started ${runs.length} zones on ${c.bold(device.name)} — ${formatDuration(total)} total.`);
    print(
      table(
        ['order', '#', 'zone', 'duration'],
        runs.map((r, i) => [String(i + 1), String(r.zone.zoneNumber), r.zone.name, formatDuration(r.seconds)]),
      ),
    );
  }
  print(c.dim('  Stop early with: rachio stop'));
}

export async function stop(opts: GlobalOpts): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);

  await client.stopWater(device.id);

  if (opts.json) return printJson({ stopped: true, device: { id: device.id, name: device.name } });
  success(`Stopped all watering on ${c.bold(device.name)}.`);
}

export async function pause(opts: GlobalOpts & { minutes?: string }): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);

  const minutes = Number(opts.minutes ?? 15);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 60) {
    throw new UserError('--minutes must be between 1 and 60 (Rachio caps a pause at 1 hour).');
  }
  const seconds = Math.round(minutes * 60);

  await client.pauseZoneRun(device.id, seconds);

  if (opts.json) return printJson({ paused: true, seconds, device: { id: device.id, name: device.name } });
  success(`Paused watering on ${c.bold(device.name)} for ${formatDuration(seconds)}.`);
  print(c.dim('  Resume early with: rachio resume'));
}

export async function resume(opts: GlobalOpts): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);

  await client.resumeZoneRun(device.id);

  if (opts.json) return printJson({ resumed: true, device: { id: device.id, name: device.name } });
  success(`Resumed watering on ${c.bold(device.name)}.`);
}

export async function rainDelay(
  hoursArg: string | undefined,
  opts: GlobalOpts & { clear?: boolean },
): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);

  if (opts.clear || hoursArg === 'clear' || hoursArg === 'off') {
    await client.setRainDelay(device.id, 0);
    if (opts.json) return printJson({ rainDelaySeconds: 0, device: { id: device.id, name: device.name } });
    return success(`Cleared the rain delay on ${c.bold(device.name)}.`);
  }

  if (hoursArg === undefined) {
    const expires = device.rainDelayExpirationDate;
    const active = Boolean(expires && expires > Date.now());
    if (opts.json) return printJson({ active, expiresAt: active ? expires : null });
    if (!active) return print(`${c.dim('No active rain delay on')} ${c.bold(device.name)}.`);
    return print(
      `${c.cyan('Rain delay active')} on ${c.bold(device.name)} until ${formatDate(expires)} (${relativeTime(expires)}).`,
    );
  }

  const hours = Number(hoursArg);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new UserError(`Rain delay hours must be a positive number, got "${hoursArg}".`);
  }
  if (hours > 168) {
    throw new UserError('Rachio caps a rain delay at 168 hours (7 days).');
  }
  const seconds = Math.round(hours * 3600);

  await client.setRainDelay(device.id, seconds);

  if (opts.json) {
    return printJson({
      rainDelaySeconds: seconds,
      expiresAt: Date.now() + seconds * 1000,
      device: { id: device.id, name: device.name },
    });
  }
  success(
    `Rain delay set on ${c.bold(device.name)} for ${formatDuration(seconds)} ` +
      c.dim(`(until ${formatDate(Date.now() + seconds * 1000)}).`),
  );
}

export async function standby(turnOn: boolean, opts: GlobalOpts): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);

  if (turnOn) await client.turnOn(device.id);
  else await client.turnOff(device.id);

  if (opts.json) return printJson({ on: turnOn, device: { id: device.id, name: device.name } });

  if (turnOn) success(`${c.bold(device.name)} is active — schedules will run.`);
  else success(`${c.bold(device.name)} is in standby — schedules will not run until you run \`rachio on\`.`);
}

export async function setZoneEnabled(
  selector: string,
  enabled: boolean,
  opts: GlobalOpts,
): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);
  const zone = selectZone(device, selector);

  if (enabled) await client.enableZone(zone.id);
  else await client.disableZone(zone.id);

  if (opts.json) {
    return printJson({ id: zone.id, name: zone.name, zoneNumber: zone.zoneNumber, enabled });
  }
  success(`${enabled ? 'Enabled' : 'Disabled'} ${c.bold(zone.name)} (zone ${zone.zoneNumber}).`);
}
