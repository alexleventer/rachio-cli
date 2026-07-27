import * as readline from 'node:readline/promises';
import { RachioClient } from '../api.ts';
import { CONFIG_PATH, clearConfig, readConfig, resolveToken, tokenSource, updateConfig } from '../config.ts';
import { UserError } from '../resolve.ts';
import { c, print, printJson, success } from '../output.ts';

async function promptSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8').trim();
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  let muted = false;
  // Suppress echo once the prompt itself has been written.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (!muted) process.stdout.write(s);
  };

  const pending = rl.question(question);
  muted = true;
  try {
    return (await pending).trim();
  } finally {
    muted = false;
    process.stdout.write('\n');
    rl.close();
  }
}

export async function login(opts: { token?: string }): Promise<void> {
  print(c.dim('Find your API key at app.rach.io → Account Settings → Get API Key.'));
  const token = opts.token?.trim() || (await promptSecret('Rachio API token: '));

  if (!token) throw new UserError('No token entered.');

  // Verify before persisting so a bad paste fails loudly here, not on the next command.
  const person = await new RachioClient(token).getMe();

  const patch: { apiToken: string; defaultDeviceId?: string } = { apiToken: token };
  const devices = (person.devices ?? []).filter((d) => !d.deleted);
  if (devices.length === 1) patch.defaultDeviceId = devices[0]!.id;

  updateConfig(patch);

  success(`Authenticated as ${c.bold(person.fullName || person.username || person.email)}.`);
  print(c.dim(`  Token saved to ${CONFIG_PATH} (mode 0600).`));
  if (devices.length === 1) {
    print(c.dim(`  Default controller set to "${devices[0]!.name}".`));
  } else if (devices.length > 1) {
    print(
      c.dim(
        `  ${devices.length} controllers found. Set a default with: rachio config set-default-device <name>`,
      ),
    );
  }
}

export async function status(opts: { json?: boolean }): Promise<void> {
  const source = tokenSource();
  const token = resolveToken();

  if (opts.json) {
    printJson({ authenticated: Boolean(token), source, configPath: CONFIG_PATH });
    return;
  }

  if (!token) {
    print(`${c.yellow('!')} Not authenticated. Run ${c.bold('rachio auth login')}.`);
    process.exitCode = 1;
    return;
  }

  const person = await new RachioClient(token).getMe();
  const devices = (person.devices ?? []).filter((d) => !d.deleted);
  success(`Authenticated as ${c.bold(person.fullName || person.username)} (${person.email})`);
  print(
    c.dim(
      `  Token source: ${source === 'env' ? 'RACHIO_API_TOKEN env var' : CONFIG_PATH}` +
        `  ·  ${devices.length} controller${devices.length === 1 ? '' : 's'}`,
    ),
  );
}

export function logout(): void {
  const had = Boolean(readConfig().apiToken);
  clearConfig();
  if (had) success(`Removed stored credentials (${CONFIG_PATH}).`);
  else print(c.dim('No stored credentials to remove.'));
  if (process.env.RACHIO_API_TOKEN) {
    print(c.yellow('  Note: RACHIO_API_TOKEN is still set in your environment and will still be used.'));
  }
}
