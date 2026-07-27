#!/usr/bin/env node
import { Command } from 'commander';
import { UserError, loadAccount, requireClient, selectDevice } from './resolve.ts';
import { RachioApiError } from './api.ts';
import { c, print, printJson, success } from './output.ts';
import { updateConfig, CONFIG_PATH } from './config.ts';
import * as auth from './commands/auth.ts';
import * as info from './commands/info.ts';
import * as control from './commands/control.ts';
import * as schedules from './commands/schedules.ts';

const program = new Command();

program
  .name('rachio')
  .description('Control your Rachio irrigation system from the command line.')
  .version('0.1.0')
  .option('--json', 'output raw JSON instead of formatted text')
  .option('-d, --device <name|id>', 'target controller (defaults to your only/default controller)')
  .showHelpAfterError();

/** Merge global options (which live on the root program) into each command's own options. */
function opts<T extends object>(command: Command): T & info.GlobalOpts {
  return { ...program.opts(), ...command.opts() } as T & info.GlobalOpts;
}

// --- auth ---------------------------------------------------------------

const authCmd = program.command('auth').description('manage your Rachio API credentials');

authCmd
  .command('login')
  .description('store an API token (prompts securely if --token is omitted)')
  .option('-t, --token <token>', 'API token; omit to be prompted without echo')
  .action(async (o: { token?: string }) => auth.login(o));

authCmd
  .command('status')
  .description('show who you are authenticated as')
  .action(async (_o, cmd: Command) => auth.status(opts(cmd)));

authCmd.command('logout').description('remove stored credentials').action(() => auth.logout());

// --- read-only ----------------------------------------------------------

program
  .command('status')
  .description('show controller state and what is watering right now')
  .action(async (_o, cmd: Command) => info.showStatus(opts(cmd)));

program
  .command('devices')
  .alias('controllers')
  .description('list the controllers on your account')
  .action(async (_o, cmd: Command) => info.listDevices(opts(cmd)));

program
  .command('zones')
  .description('list zones on a controller')
  .option('-a, --all', 'include disabled zones')
  .action(async (_o, cmd: Command) => info.listZones(opts(cmd)));

program
  .command('zone <zone>')
  .description('show details for one zone (by number, name, or id)')
  .action(async (zone: string, _o, cmd: Command) => info.showZone(zone, opts(cmd)));

program
  .command('events')
  .description('show recent controller events')
  .option('--days <n>', 'how far back to look', '3')
  .option('--limit <n>', 'maximum events to show', '25')
  .action(async (_o, cmd: Command) => info.listEvents(opts(cmd)));

// --- watering -----------------------------------------------------------

program
  .command('water <zone...>')
  .alias('run')
  .description('start one or more zones; accepts "zone:minutes" for per-zone durations')
  .option('-m, --minutes <n>', 'duration for zones without an explicit time', '10')
  .addHelpText(
    'after',
    `
Examples:
  $ rachio water 3 --minutes 15          Zone 3 for 15 minutes
  $ rachio water "Front Lawn"            By name, default 10 minutes
  $ rachio water 1 2 3 -m 5              Three zones, 5 minutes each, in order
  $ rachio water 1:10 4:20 "Beds":5      Per-zone durations
`,
  )
  .action(async (zones: string[], _o, cmd: Command) => control.water(zones, opts(cmd)));

program
  .command('stop')
  .description('stop all watering on the controller')
  .action(async (_o, cmd: Command) => control.stop(opts(cmd)));

program
  .command('pause')
  .description('pause the running zone (max 60 minutes)')
  .option('-m, --minutes <n>', 'how long to pause', '15')
  .action(async (_o, cmd: Command) => control.pause(opts(cmd)));

program
  .command('resume')
  .description('resume a paused zone run')
  .action(async (_o, cmd: Command) => control.resume(opts(cmd)));

program
  .command('rain-delay [hours]')
  .description('show, set, or clear a rain delay (e.g. "rain-delay 24", "rain-delay clear")')
  .option('--clear', 'cancel an active rain delay')
  .action(async (hours: string | undefined, _o, cmd: Command) => control.rainDelay(hours, opts(cmd)));

program
  .command('on')
  .description('take the controller out of standby so schedules run')
  .action(async (_o, cmd: Command) => control.standby(true, opts(cmd)));

program
  .command('off')
  .alias('standby')
  .description('put the controller in standby (schedules will not run)')
  .action(async (_o, cmd: Command) => control.standby(false, opts(cmd)));

program
  .command('enable <zone>')
  .description('enable a zone so schedules and manual runs can use it')
  .action(async (zone: string, _o, cmd: Command) => control.setZoneEnabled(zone, true, opts(cmd)));

program
  .command('disable <zone>')
  .description('disable a zone')
  .action(async (zone: string, _o, cmd: Command) => control.setZoneEnabled(zone, false, opts(cmd)));

// --- schedules ----------------------------------------------------------

program
  .command('schedules')
  .description('list watering schedules')
  .action(async (_o, cmd: Command) => schedules.listSchedules(opts(cmd)));

const scheduleCmd = program.command('schedule').description('act on a watering schedule');
scheduleCmd
  .command('run <schedule>')
  .description('start a fixed schedule now')
  .action(async (s: string, _o, cmd: Command) => schedules.runSchedule(s, opts(cmd)));
scheduleCmd
  .command('skip <schedule>')
  .description('skip the next run of a fixed schedule')
  .action(async (s: string, _o, cmd: Command) => schedules.skipSchedule(s, opts(cmd)));
scheduleCmd
  .command('adjust <schedule> <percent>')
  .description('set seasonal adjustment, -100 to 100 (e.g. -20 for 20% less water)')
  .action(async (s: string, p: string, _o, cmd: Command) =>
    schedules.seasonalAdjustment(s, p, opts(cmd)),
  );

// --- config -------------------------------------------------------------

const configCmd = program.command('config').description('CLI configuration');

configCmd
  .command('path')
  .description('print the config file location')
  .action(() => print(CONFIG_PATH));

configCmd
  .command('set-default-device <name|id>')
  .description('choose which controller commands target by default')
  .action(async (selector: string, _o, cmd: Command) => {
    const client = requireClient();
    const { devices } = await loadAccount(client);
    const device = selectDevice(devices, selector);
    updateConfig({ defaultDeviceId: device.id });
    const o = opts(cmd);
    if (o.json) return printJson({ defaultDeviceId: device.id, name: device.name });
    success(`Default controller set to ${c.bold(device.name)}.`);
  });

// --- error handling -----------------------------------------------------

function fail(message: string): never {
  process.stderr.write(`${c.red('✗')} ${message}\n`);
  process.exit(1);
}

process.on('unhandledRejection', (err) => {
  fail(err instanceof Error ? err.message : String(err));
});

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof UserError) fail(err.message);
  if (err instanceof RachioApiError) fail(err.message);
  if (err instanceof Error) fail(err.message);
  fail(String(err));
}
