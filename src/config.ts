import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, chmodSync } from 'node:fs';

export interface Config {
  apiToken?: string;
  /** Device id used when --device is omitted and the account has more than one controller. */
  defaultDeviceId?: string;
}

const CONFIG_DIR =
  process.env.RACHIO_CONFIG_DIR ??
  join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'rachio');

export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export function readConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Config;
  } catch {
    throw new Error(`Config file at ${CONFIG_PATH} is not valid JSON. Fix or delete it.`);
  }
}

export function writeConfig(config: Config): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  // writeFileSync's mode only applies on create; enforce it for pre-existing files too.
  chmodSync(CONFIG_PATH, 0o600);
}

export function updateConfig(patch: Partial<Config>): Config {
  const next = { ...readConfig(), ...patch };
  for (const key of Object.keys(patch) as Array<keyof Config>) {
    if (patch[key] === undefined) delete next[key];
  }
  writeConfig(next);
  return next;
}

export function clearConfig(): void {
  rmSync(CONFIG_PATH, { force: true });
}

/** Env var wins over the stored config so scripts and CI can override it. */
export function resolveToken(): string | undefined {
  const fromEnv = process.env.RACHIO_API_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return readConfig().apiToken?.trim() || undefined;
}

export function tokenSource(): 'env' | 'config' | 'none' {
  if (process.env.RACHIO_API_TOKEN?.trim()) return 'env';
  if (readConfig().apiToken?.trim()) return 'config';
  return 'none';
}
