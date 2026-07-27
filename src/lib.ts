/**
 * Library entry point.
 *
 * `rachio` the binary is only one consumer of this package; the typed client and
 * the name/number resolution helpers are useful on their own (for example from a
 * home-automation daemon that wants to start a zone without shelling out).
 */
export { RachioClient, RachioApiError } from './api.ts';
export { selectDevice, selectZone, loadAccount, UserError } from './resolve.ts';
export { resolveToken } from './config.ts';
export type {
  Person,
  Device,
  Zone,
  ScheduleRule,
  FlexScheduleRule,
  CurrentSchedule,
  DeviceEvent,
  ZoneRunDuration,
} from './types.ts';
