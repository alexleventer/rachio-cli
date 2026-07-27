import { RachioClient } from './api.ts';
import { readConfig, resolveToken } from './config.ts';
import type { Device, Person, Zone } from './types.ts';

export class UserError extends Error {}

export function requireClient(): RachioClient {
  const token = resolveToken();
  if (!token) {
    throw new UserError(
      'No API token configured.\n' +
        '  Get one at app.rach.io → Account Settings → Get API Key, then run:\n' +
        '    rachio auth login\n' +
        '  Or set RACHIO_API_TOKEN in your environment.',
    );
  }
  return new RachioClient(token);
}

/** Person payload includes fully-hydrated devices and zones, so one call covers most commands. */
export async function loadAccount(client: RachioClient): Promise<Person> {
  const person = await client.getMe();
  return { ...person, devices: (person.devices ?? []).filter((d) => !d.deleted) };
}

/**
 * Pick the target controller. Precedence: explicit --device, configured default,
 * then the only device on the account.
 */
export function selectDevice(devices: Device[], selector?: string): Device {
  if (devices.length === 0) {
    throw new UserError('This Rachio account has no controllers.');
  }

  if (selector) {
    const needle = selector.trim().toLowerCase();
    const match =
      devices.find((d) => d.id.toLowerCase() === needle) ??
      devices.find((d) => d.name?.toLowerCase() === needle) ??
      devices.find((d) => d.serialNumber?.toLowerCase() === needle) ??
      matchOne(devices.filter((d) => d.name?.toLowerCase().includes(needle)), selector, 'controller');
    if (!match) {
      throw new UserError(
        `No controller matches "${selector}". Available: ${devices.map((d) => d.name).join(', ')}`,
      );
    }
    return match;
  }

  const configured = readConfig().defaultDeviceId;
  if (configured) {
    const match = devices.find((d) => d.id === configured);
    if (match) return match;
  }

  if (devices.length === 1) return devices[0]!;

  throw new UserError(
    `This account has ${devices.length} controllers. Pass --device <name>, or set a default:\n` +
      `    rachio config set-default-device <name>\n` +
      `  Available: ${devices.map((d) => d.name).join(', ')}`,
  );
}

/** Resolve "3", "Front Lawn", "front", or a raw zone id against a controller's zones. */
export function selectZone(device: Device, selector: string): Zone {
  const zones = device.zones ?? [];
  const needle = selector.trim().toLowerCase();

  if (/^\d+$/.test(needle)) {
    const byNumber = zones.find((z) => z.zoneNumber === Number(needle));
    if (byNumber) return byNumber;
    throw new UserError(
      `${device.name} has no zone number ${needle}. Valid: ${zones.map((z) => z.zoneNumber).join(', ')}`,
    );
  }

  const exact =
    zones.find((z) => z.id.toLowerCase() === needle) ??
    zones.find((z) => z.name?.toLowerCase() === needle);
  if (exact) return exact;

  const partial = zones.filter((z) => z.name?.toLowerCase().includes(needle));
  const match = matchOne(partial, selector, 'zone');
  if (!match) {
    throw new UserError(
      `No zone matches "${selector}" on ${device.name}.\n  Zones: ${zones
        .map((z) => `${z.zoneNumber}=${z.name}`)
        .join(', ')}`,
    );
  }
  return match;
}

function matchOne<T extends { name?: string }>(
  candidates: T[],
  selector: string,
  kind: string,
): T | undefined {
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new UserError(
      `"${selector}" matches ${candidates.length} ${kind}s: ${candidates
        .map((cn) => cn.name)
        .join(', ')}. Be more specific.`,
    );
  }
  return undefined;
}

/**
 * Parse a `zone[:minutes]` argument list, e.g. ["1:10", "front lawn"].
 * Falls back to `defaultMinutes` when a per-zone duration is absent.
 */
export function parseZoneArgs(
  device: Device,
  args: string[],
  defaultMinutes: number,
): Array<{ zone: Zone; seconds: number }> {
  return args.map((raw) => {
    // Split on the LAST colon so zone names containing ':' still work.
    const idx = raw.lastIndexOf(':');
    let selector = raw;
    let minutes = defaultMinutes;

    if (idx > 0) {
      const tail = raw.slice(idx + 1);
      if (/^\d+(\.\d+)?$/.test(tail)) {
        selector = raw.slice(0, idx);
        minutes = Number(tail);
      }
    }

    const seconds = Math.round(minutes * 60);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new UserError(`Invalid duration for "${raw}": must be greater than 0 minutes.`);
    }
    if (seconds > 10800) {
      throw new UserError(
        `Duration for "${raw}" is ${minutes} minutes; Rachio caps a single zone run at 180 minutes.`,
      );
    }
    return { zone: selectZone(device, selector), seconds };
  });
}
