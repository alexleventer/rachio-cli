import type {
  CurrentSchedule,
  Device,
  DeviceEvent,
  FlexScheduleRule,
  Person,
  PersonInfo,
  ScheduleRule,
  Zone,
  ZoneRunDuration,
} from './types.ts';

const BASE_URL = process.env.RACHIO_API_URL ?? 'https://api.rach.io/1/public';

export class RachioApiError extends Error {
  readonly status: number;
  readonly body: string;

  // Fields are assigned explicitly rather than via parameter properties so that
  // `node --experimental-strip-types` can run this file directly.
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'RachioApiError';
    this.status = status;
    this.body = body;
  }
}

/** Thin typed wrapper over the Rachio public REST API. */
export class RachioClient {
  #token: string;
  #timeoutMs: number;

  constructor(token: string, opts: { timeoutMs?: number } = {}) {
    this.#token = token;
    this.#timeoutMs = opts.timeoutMs ?? 15_000;
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#token}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (err) {
      const cause = err as Error;
      if (cause.name === 'TimeoutError' || cause.name === 'AbortError') {
        throw new Error(`Request to ${method} ${path} timed out after ${this.#timeoutMs}ms.`);
      }
      throw new Error(`Could not reach the Rachio API (${method} ${path}): ${cause.message}`);
    }

    const text = await res.text();

    if (!res.ok) {
      throw new RachioApiError(describeHttpError(res.status, text, path), res.status, text);
    }

    // Several mutating endpoints return 204 with an empty body.
    if (!text.trim()) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Rachio API returned a non-JSON response for ${method} ${path}: ${text.slice(0, 200)}`);
    }
  }

  // --- Person -------------------------------------------------------------

  getPersonInfo(): Promise<PersonInfo> {
    return this.#request<PersonInfo>('GET', '/person/info');
  }

  getPerson(personId: string): Promise<Person> {
    return this.#request<Person>('GET', `/person/${personId}`);
  }

  /** Convenience: resolve the authenticated user in one call chain. */
  async getMe(): Promise<Person> {
    const { id } = await this.getPersonInfo();
    return this.getPerson(id);
  }

  // --- Device -------------------------------------------------------------

  getDevice(deviceId: string): Promise<Device> {
    return this.#request<Device>('GET', `/device/${deviceId}`);
  }

  getCurrentSchedule(deviceId: string): Promise<CurrentSchedule> {
    return this.#request<CurrentSchedule>('GET', `/device/${deviceId}/current_schedule`);
  }

  getEvents(deviceId: string, startTimeMs: number, endTimeMs: number): Promise<DeviceEvent[]> {
    const qs = `startTime=${Math.floor(startTimeMs)}&endTime=${Math.floor(endTimeMs)}`;
    return this.#request<DeviceEvent[]>('GET', `/device/${deviceId}/event?${qs}`);
  }

  getForecast(deviceId: string, units: 'US' | 'METRIC' = 'US'): Promise<unknown> {
    return this.#request('GET', `/device/${deviceId}/forecast?units=${units}`);
  }

  stopWater(deviceId: string): Promise<void> {
    return this.#request<void>('PUT', '/device/stop_water', { id: deviceId });
  }

  turnOn(deviceId: string): Promise<void> {
    return this.#request<void>('PUT', '/device/on', { id: deviceId });
  }

  turnOff(deviceId: string): Promise<void> {
    return this.#request<void>('PUT', '/device/off', { id: deviceId });
  }

  /** `durationSeconds` of 0 cancels an active rain delay. Max 7 days. */
  setRainDelay(deviceId: string, durationSeconds: number): Promise<void> {
    return this.#request<void>('PUT', '/device/rain_delay', {
      id: deviceId,
      duration: durationSeconds,
    });
  }

  /** Pause the in-progress zone run for up to 1 hour. */
  pauseZoneRun(deviceId: string, durationSeconds: number): Promise<void> {
    return this.#request<void>('PUT', '/device/pause_zone_run', {
      id: deviceId,
      duration: durationSeconds,
    });
  }

  resumeZoneRun(deviceId: string): Promise<void> {
    return this.#request<void>('PUT', '/device/resume_zone_run', { id: deviceId });
  }

  // --- Zone ---------------------------------------------------------------

  getZone(zoneId: string): Promise<Zone> {
    return this.#request<Zone>('GET', `/zone/${zoneId}`);
  }

  startZone(zoneId: string, durationSeconds: number): Promise<void> {
    return this.#request<void>('PUT', '/zone/start', { id: zoneId, duration: durationSeconds });
  }

  startMultipleZones(runs: ZoneRunDuration[]): Promise<void> {
    return this.#request<void>('PUT', '/zone/start_multiple', { zones: runs });
  }

  enableZone(zoneId: string): Promise<void> {
    return this.#request<void>('PUT', '/zone/enable', { id: zoneId });
  }

  disableZone(zoneId: string): Promise<void> {
    return this.#request<void>('PUT', '/zone/disable', { id: zoneId });
  }

  // --- Schedules ----------------------------------------------------------

  getScheduleRule(id: string): Promise<ScheduleRule> {
    return this.#request<ScheduleRule>('GET', `/schedulerule/${id}`);
  }

  getFlexScheduleRule(id: string): Promise<FlexScheduleRule> {
    return this.#request<FlexScheduleRule>('GET', `/flexschedulerule/${id}`);
  }

  startScheduleRule(id: string): Promise<void> {
    return this.#request<void>('PUT', '/schedulerule/start', { id });
  }

  skipScheduleRule(id: string): Promise<void> {
    return this.#request<void>('PUT', '/schedulerule/skip', { id });
  }

  /** `adjustment` is a fraction from -1 to 1. */
  setSeasonalAdjustment(id: string, adjustment: number): Promise<void> {
    return this.#request<void>('PUT', '/schedulerule/seasonal_adjustment', { id, adjustment });
  }
}

function describeHttpError(status: number, body: string, path: string): string {
  const detail = extractErrorDetail(body);
  switch (status) {
    case 401:
      return 'Rachio rejected the API token (401). Run `rachio auth login` with a current token from app.rach.io → Account Settings → Get API Key.';
    case 403:
      return `Rachio denied access to ${path} (403). The token may not own this device or zone.${detail}`;
    case 404:
      return `Not found: ${path} (404). Double-check the device, zone, or schedule id.${detail}`;
    case 429:
      return 'Rate limited by Rachio (429). The public API allows 1700 calls per day; wait before retrying.';
    default:
      if (status >= 500) return `Rachio API error ${status} on ${path}. This is upstream — retry shortly.${detail}`;
      return `Rachio API request failed with ${status} on ${path}.${detail}`;
  }
}

function extractErrorDetail(body: string): string {
  if (!body.trim()) return '';
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ message?: string }>; message?: string };
    const message = parsed.errors?.[0]?.message ?? parsed.message;
    if (message) return ` ${message}`;
  } catch {
    // Fall through to the raw body.
  }
  return ` ${body.slice(0, 200)}`;
}
