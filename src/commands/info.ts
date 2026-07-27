import { loadAccount, requireClient, selectDevice, selectZone } from '../resolve.ts';
import {
  c,
  formatDate,
  formatDuration,
  keyValues,
  print,
  printJson,
  relativeTime,
  statusDot,
  table,
} from '../output.ts';
import type { CurrentSchedule, Device, Zone } from '../types.ts';

export interface GlobalOpts {
  json?: boolean;
  device?: string;
}

export async function listDevices(opts: GlobalOpts): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);

  if (opts.json) return printJson(devices);

  print(
    table(
      ['', 'name', 'model', 'zones', 'state', 'id'],
      devices.map((d) => [
        statusDot(d.status === 'ONLINE'),
        c.bold(d.name),
        d.model ?? '—',
        String((d.zones ?? []).filter((z) => z.enabled).length),
        d.on ? c.green('active') : c.yellow('standby'),
        c.dim(d.id),
      ]),
    ),
  );
}

export async function listZones(opts: GlobalOpts & { all?: boolean }): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);

  const zones = [...(device.zones ?? [])]
    .filter((z) => opts.all || z.enabled)
    .sort((a, b) => a.zoneNumber - b.zoneNumber);

  if (opts.json) return printJson(zones);

  print(c.bold(device.name));
  print(
    table(
      ['#', 'name', 'default', 'last watered', 'enabled'],
      zones.map((z) => [
        String(z.zoneNumber),
        z.name,
        z.runtime ? formatDuration(z.runtime) : '—',
        z.lastWateredDate ? relativeTime(z.lastWateredDate) : c.dim('never'),
        z.enabled ? c.green('yes') : c.dim('no'),
      ]),
    ),
  );
  if (!opts.all) {
    const hidden = (device.zones ?? []).length - zones.length;
    if (hidden > 0) print(c.dim(`\n  ${hidden} disabled zone(s) hidden — use --all to show.`));
  }
}

export async function showStatus(opts: GlobalOpts): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const targets = opts.device ? [selectDevice(devices, opts.device)] : devices;

  const schedules = await Promise.all(
    targets.map(async (d) => {
      try {
        return await client.getCurrentSchedule(d.id);
      } catch {
        return {} as CurrentSchedule;
      }
    }),
  );

  if (opts.json) {
    return printJson(
      targets.map((device, i) => ({
        device,
        currentSchedule: schedules[i],
        running: isRunning(schedules[i]),
      })),
    );
  }

  targets.forEach((device, i) => {
    if (i > 0) print();
    printDeviceStatus(device, schedules[i] ?? {});
  });
}

function isRunning(schedule: CurrentSchedule | undefined): boolean {
  return Boolean(schedule && Object.keys(schedule).length > 0 && schedule.zoneId);
}

function printDeviceStatus(device: Device, schedule: CurrentSchedule): void {
  const online = device.status === 'ONLINE';
  print(`${statusDot(online)} ${c.bold(device.name)} ${c.dim(`· ${device.model ?? 'Rachio'}`)}`);

  const rows: Array<[string, string]> = [
    ['Controller', online ? c.green('online') : c.red('offline')],
    ['Mode', device.on ? c.green('active') : c.yellow('standby (schedules paused)')],
  ];

  const rainDelayEnd = device.rainDelayExpirationDate;
  if (rainDelayEnd && rainDelayEnd > Date.now()) {
    rows.push(['Rain delay', c.cyan(`until ${formatDate(rainDelayEnd)} (${relativeTime(rainDelayEnd)})`)]);
  }

  if (isRunning(schedule)) {
    const zone = (device.zones ?? []).find((z) => z.id === schedule.zoneId);
    const label = zone ? `${zone.name} (zone ${zone.zoneNumber})` : (schedule.zoneId ?? 'unknown zone');
    const paused = schedule.status === 'PAUSED';
    rows.push(['Watering', paused ? c.yellow(`${label} — paused`) : c.green(label)]);

    if (schedule.zoneStartDate && schedule.zoneDuration) {
      const endsAt = schedule.zoneStartDate + schedule.zoneDuration * 1000;
      const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      rows.push([
        'Remaining',
        `${formatDuration(remaining)} of ${formatDuration(schedule.zoneDuration)}`,
      ]);
    }
    if (schedule.type) rows.push(['Source', schedule.type === 'MANUAL' ? 'manual run' : 'schedule']);
    if (schedule.cycling && schedule.totalCycleCount) {
      rows.push(['Cycle', `${schedule.cycleCount ?? 1} of ${schedule.totalCycleCount} (cycle & soak)`]);
    }
  } else {
    rows.push(['Watering', c.dim('idle')]);
    const last = lastWatered(device.zones ?? []);
    if (last) rows.push(['Last run', `${last.name} · ${relativeTime(last.lastWateredDate)}`]);
  }

  print(keyValues(rows));
}

function lastWatered(zones: Zone[]): Zone | undefined {
  return zones
    .filter((z) => z.lastWateredDate)
    .sort((a, b) => (b.lastWateredDate ?? 0) - (a.lastWateredDate ?? 0))[0];
}

export async function showZone(selector: string, opts: GlobalOpts): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);
  const zone = selectZone(device, selector);

  if (opts.json) return printJson(zone);

  print(`${c.bold(zone.name)} ${c.dim(`· zone ${zone.zoneNumber} on ${device.name}`)}`);
  const rows: Array<[string, string]> = [
    ['Enabled', zone.enabled ? c.green('yes') : c.dim('no')],
    ['Default run', zone.runtime ? formatDuration(zone.runtime) : '—'],
    ['Last watered', zone.lastWateredDate ? `${formatDate(zone.lastWateredDate)} (${relativeTime(zone.lastWateredDate)})` : c.dim('never')],
  ];
  if (zone.customNozzle?.name) rows.push(['Nozzle', zone.customNozzle.name]);
  if (zone.customSoil?.name) rows.push(['Soil', zone.customSoil.name]);
  if (zone.customCrop?.name) rows.push(['Vegetation', zone.customCrop.name]);
  if (zone.customShade?.name) rows.push(['Exposure', zone.customShade.name]);
  if (zone.yardAreaSquareFeet) rows.push(['Area', `${zone.yardAreaSquareFeet} sq ft`]);
  rows.push(['Zone id', c.dim(zone.id)]);
  print(keyValues(rows));
}

export async function listEvents(opts: GlobalOpts & { days?: string; limit?: string }): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);

  const days = Number(opts.days ?? 3);
  const limit = Number(opts.limit ?? 25);
  const end = Date.now();
  const start = end - days * 86_400_000;

  const events = await client.getEvents(device.id, start, end);
  const sorted = [...(events ?? [])].sort((a, b) => b.eventDate - a.eventDate).slice(0, limit);

  if (opts.json) return printJson(sorted);

  print(`${c.bold(device.name)} ${c.dim(`· last ${days} day(s)`)}`);
  print(
    table(
      ['when', 'category', 'event'],
      sorted.map((e) => [
        formatDate(e.eventDate),
        c.dim(e.category ?? e.type ?? '—'),
        e.summary ?? e.subType ?? e.type ?? '—',
      ]),
    ),
  );
}
