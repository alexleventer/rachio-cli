const ESC = String.fromCharCode(27);

const useColor =
  !process.env.NO_COLOR &&
  process.env.TERM !== 'dumb' &&
  (process.env.FORCE_COLOR ? true : process.stdout.isTTY === true);

function wrap(code: number, close: number) {
  return (text: string): string =>
    useColor ? `${ESC}[${code}m${text}${ESC}[${close}m` : text;
}

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

const ANSI_PATTERN = new RegExp(`${ESC}\\[\\d+m`, 'g');

/** Visible width, ignoring ANSI escapes. */
function width(text: string): number {
  return text.replace(ANSI_PATTERN, '').length;
}

export function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return c.dim('  (none)');
  const widths = headers.map((h, i) =>
    Math.max(width(h), ...rows.map((r) => width(r[i] ?? ''))),
  );
  const pad = (text: string, i: number) =>
    text + ' '.repeat(Math.max(0, (widths[i] ?? 0) - width(text)));
  const lines = [
    '  ' + headers.map((h, i) => c.dim(pad(h.toUpperCase(), i))).join('  ').trimEnd(),
    ...rows.map((r) => '  ' + r.map((cell, i) => pad(cell ?? '', i)).join('  ').trimEnd()),
  ];
  return lines.join('\n');
}

export function keyValues(pairs: Array<[string, string]>): string {
  const labelWidth = Math.max(...pairs.map(([k]) => k.length));
  return pairs
    .map(([k, v]) => `  ${c.dim((k + ':').padEnd(labelWidth + 1))} ${v}`)
    .join('\n');
}

/** 3900 -> "1h 5m"; 90 -> "1m 30s". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !h) parts.push(`${s}s`);
  return parts.length ? parts.join(' ') : '0s';
}

export function formatDate(ms: number | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "3h ago" / "in 2d". */
export function relativeTime(ms: number | undefined, now = Date.now()): string {
  if (!ms) return '—';
  const deltaSec = Math.round((ms - now) / 1000);
  const abs = Math.abs(deltaSec);
  const steps: Array<[limit: number, divisor: number, unit: string]> = [
    [60, 1, 's'],
    [3600, 60, 'm'],
    [86400, 3600, 'h'],
    [Number.POSITIVE_INFINITY, 86400, 'd'],
  ];
  const step = steps.find(([limit]) => abs < limit) ?? steps[steps.length - 1]!;
  const value = Math.round(abs / step[1]);
  return deltaSec < 0 ? `${value}${step[2]} ago` : `in ${value}${step[2]}`;
}

export function statusDot(online: boolean): string {
  return online ? c.green('●') : c.red('●');
}

export function print(text = ''): void {
  process.stdout.write(text + '\n');
}

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

export function success(message: string): void {
  print(`${c.green('✓')} ${message}`);
}

export function warn(message: string): void {
  process.stderr.write(`${c.yellow('!')} ${message}\n`);
}
