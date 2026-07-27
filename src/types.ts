/** Data objects returned by the Rachio public API (https://api.rach.io/1/public). */

export interface PersonInfo {
  id: string;
}

export interface Person {
  id: string;
  username: string;
  fullName: string;
  email: string;
  createDate: number;
  deleted: boolean;
  devices: Device[];
}

export interface Device {
  id: string;
  name: string;
  serialNumber: string;
  macAddress: string;
  model: string;
  status: 'ONLINE' | 'OFFLINE' | string;
  /** false while the controller is in "standby" mode — schedules will not run. */
  on: boolean;
  deleted: boolean;
  latitude: number;
  longitude: number;
  timeZone?: string;
  utcOffset?: number;
  createDate: number;
  scheduleModeType?: string;
  homeKitCompatible?: boolean;
  rainDelayExpirationDate?: number;
  rainDelayStartDate?: number;
  zones: Zone[];
  scheduleRules?: ScheduleRule[];
  flexScheduleRules?: FlexScheduleRule[];
}

export interface Zone {
  id: string;
  name: string;
  zoneNumber: number;
  enabled: boolean;
  /** Default runtime in seconds. */
  runtime?: number;
  maxRuntime?: number;
  lastWateredDate?: number;
  imageUrl?: string;
  availableWater?: number;
  depthOfWater?: number;
  rootZoneDepth?: number;
  efficiency?: number;
  yardAreaSquareFeet?: number;
  customNozzle?: { name?: string; category?: string; inchesPerHour?: number };
  customSoil?: { name?: string; category?: string };
  customCrop?: { name?: string; category?: string };
  customShade?: { name?: string; category?: string };
}

export interface ScheduleRuleZone {
  zoneId: string;
  duration: number;
  sortOrder: number;
}

export interface ScheduleRule {
  id: string;
  name: string;
  externalName?: string;
  enabled: boolean;
  totalDuration?: number;
  startDate?: number;
  startHour?: number;
  startMinute?: number;
  cycleSoak?: boolean;
  cycleSoakStatus?: string;
  etSkip?: boolean;
  operator?: string;
  summary?: string;
  zones?: ScheduleRuleZone[];
  scheduleJobTypes?: string[];
}

export interface FlexScheduleRule {
  id: string;
  name: string;
  enabled: boolean;
  startDate?: number;
  startHour?: number;
  startMinute?: number;
  cycleSoak?: boolean;
  summary?: string;
  zones?: ScheduleRuleZone[];
}

/**
 * GET /device/:id/current_schedule
 * Returns `{}` when nothing is running.
 */
export interface CurrentSchedule {
  type?: 'AUTOMATIC' | 'MANUAL' | string;
  status?: 'PROCESSING' | 'PAUSED' | string;
  scheduleRuleId?: string;
  deviceId?: string;
  zoneId?: string;
  zoneStartDate?: number;
  zoneDuration?: number;
  startDate?: number;
  duration?: number;
  cycleCount?: number;
  totalCycleCount?: number;
  cycling?: boolean;
  durationNoCycle?: number;
}

export interface DeviceEvent {
  eventId?: string;
  deviceId?: string;
  category?: string;
  type?: string;
  subType?: string;
  eventDate: number;
  createDate?: number;
  summary?: string;
  topic?: string;
  eventDatas?: Array<{ key?: string; value?: string }>;
  [key: string]: unknown;
}

/** Payload element for PUT /zone/start_multiple. `sortOrder` is 1-indexed. */
export interface ZoneRunDuration {
  id: string;
  duration: number;
  sortOrder: number;
}
