import { loadAccount, requireClient, selectDevice, UserError } from '../resolve.ts';
import { c, formatDuration, print, printJson, success, table } from '../output.ts';
import type { GlobalOpts } from './info.ts';
import type { Device, ScheduleRule } from '../types.ts';

interface AnySchedule {
  id: string;
  name: string;
  enabled: boolean;
  totalDuration?: number;
  startHour?: number;
  startMinute?: number;
  flex: boolean;
}

function collect(device: Device): AnySchedule[] {
  const fixed = (device.scheduleRules ?? []).map((s) => ({ ...toAny(s), flex: false }));
  const flex = (device.flexScheduleRules ?? []).map((s) => ({ ...toAny(s), flex: true }));
  return [...fixed, ...flex];
}

function toAny(rule: ScheduleRule | { id: string; name: string; enabled: boolean }): Omit<AnySchedule, 'flex'> {
  const r = rule as ScheduleRule;
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    totalDuration: r.totalDuration,
    startHour: r.startHour,
    startMinute: r.startMinute,
  };
}

function startTime(s: AnySchedule): string {
  if (s.startHour === undefined) return '—';
  const h = s.startHour;
  const m = s.startMinute ?? 0;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export async function listSchedules(opts: GlobalOpts): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);
  const schedules = collect(device);

  if (opts.json) return printJson(schedules);

  print(c.bold(device.name));
  print(
    table(
      ['name', 'type', 'starts', 'duration', 'enabled', 'id'],
      schedules.map((s) => [
        s.name,
        s.flex ? c.cyan('flex') : 'fixed',
        startTime(s),
        s.totalDuration ? formatDuration(s.totalDuration) : '—',
        s.enabled ? c.green('yes') : c.dim('no'),
        c.dim(s.id),
      ]),
    ),
  );
  if (schedules.length) print(c.dim('\n  Run one now: rachio schedule run "<name>"'));
}

function findSchedule(device: Device, selector: string): AnySchedule {
  const schedules = collect(device);
  const needle = selector.trim().toLowerCase();

  const exact =
    schedules.find((s) => s.id.toLowerCase() === needle) ??
    schedules.find((s) => s.name?.toLowerCase() === needle);
  if (exact) return exact;

  const partial = schedules.filter((s) => s.name?.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0]!;
  if (partial.length > 1) {
    throw new UserError(
      `"${selector}" matches ${partial.length} schedules: ${partial.map((s) => s.name).join(', ')}. Be more specific.`,
    );
  }
  throw new UserError(
    `No schedule matches "${selector}" on ${device.name}.` +
      (schedules.length ? `\n  Available: ${schedules.map((s) => s.name).join(', ')}` : ''),
  );
}

export async function runSchedule(selector: string, opts: GlobalOpts): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);
  const schedule = findSchedule(device, selector);

  if (schedule.flex) {
    throw new UserError(
      `"${schedule.name}" is a Flex schedule; the Rachio API only supports starting fixed schedules.\n` +
        '  Water the zones directly instead: rachio water <zone> --minutes N',
    );
  }

  await client.startScheduleRule(schedule.id);

  if (opts.json) return printJson({ started: true, schedule: { id: schedule.id, name: schedule.name } });
  success(`Started schedule ${c.bold(schedule.name)} on ${device.name}.`);
}

export async function skipSchedule(selector: string, opts: GlobalOpts): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);
  const schedule = findSchedule(device, selector);

  if (schedule.flex) {
    throw new UserError(`"${schedule.name}" is a Flex schedule; the API can only skip fixed schedules.`);
  }

  await client.skipScheduleRule(schedule.id);

  if (opts.json) return printJson({ skipped: true, schedule: { id: schedule.id, name: schedule.name } });
  success(`Skipped the next run of ${c.bold(schedule.name)}.`);
}

export async function seasonalAdjustment(
  selector: string,
  percentArg: string,
  opts: GlobalOpts,
): Promise<void> {
  const client = requireClient();
  const { devices } = await loadAccount(client);
  const device = selectDevice(devices, opts.device);
  const schedule = findSchedule(device, selector);

  const percent = Number(percentArg);
  if (!Number.isFinite(percent) || percent < -100 || percent > 100) {
    throw new UserError(`Adjustment must be a percentage between -100 and 100, got "${percentArg}".`);
  }

  const adjustment = percent / 100;
  await client.setSeasonalAdjustment(schedule.id, adjustment);

  if (opts.json) return printJson({ id: schedule.id, name: schedule.name, adjustment });
  success(
    `Set seasonal adjustment on ${c.bold(schedule.name)} to ${percent > 0 ? '+' : ''}${percent}%.`,
  );
}
