import type { PollKind } from './polls.ts';

export const ALL_KINDS: readonly PollKind[] = ['fridays', 'saturdays', 'holidays'];

export interface Destination {
  readonly alias: string;
  readonly chatId: string;
}

export interface RunConfig {
  readonly token: string;
  readonly destinations: readonly Destination[];
  readonly targetMonth: string | undefined;
  readonly mode: 'preview' | 'prepare' | 'live';
  readonly claimId: string | undefined;
  readonly force: boolean;
  readonly offline: boolean;
  readonly kinds: readonly PollKind[];
  readonly slots: readonly string[] | undefined;
}

const ALIAS = /^[a-z][a-z0-9-]{0,31}$/;
const GROUP_CHAT_ID = /^-\d+$/;
const CLAIM_ID = /^[A-Za-z0-9._-]{1,100}$/;

function destinationsFrom(env: Record<string, string | undefined>): Destination[] {
  const raw = env.TELEGRAM_DESTINATIONS ?? '';
  if (raw.trim() === '') {
    throw new Error('TELEGRAM_DESTINATIONS must list at least one alias=chatId destination');
  }

  const aliases = new Set<string>();
  const chatIds = new Set<string>();
  return raw.split(',').map((entry) => {
    const [alias, ...rest] = entry.trim().split('=');
    const chatId = rest.join('=').trim();
    if (rest.length !== 1 || !alias || !ALIAS.test(alias) || !GROUP_CHAT_ID.test(chatId)) {
      throw new Error('TELEGRAM_DESTINATIONS entries must use safe-alias=chatId syntax');
    }
    if (aliases.has(alias)) throw new Error(`duplicate destination alias "${alias}"`);
    if (chatIds.has(chatId)) throw new Error('each destination must use a unique chat id');
    aliases.add(alias);
    chatIds.add(chatId);
    return { alias, chatId };
  });
}

function parseArgs(argv: readonly string[]): Record<string, string | true> {
  const valueFlags = new Set(['month', 'only', 'slots', 'claim', 'to']);
  const booleanFlags = new Set(['preview', 'prepare', 'live', 'force', 'offline']);
  const parsed: Record<string, string | true> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) throw new Error(`unexpected argument "${token ?? ''}"`);
    const name = token.slice(2);
    if (!valueFlags.has(name) && !booleanFlags.has(name))
      throw new Error(`unknown flag "${token}"`);
    if (parsed[name] !== undefined) throw new Error(`duplicate flag "${token}"`);
    if (valueFlags.has(name)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`flag "${token}" requires a value`);
      parsed[name] = value;
      index += 1;
    } else {
      parsed[name] = true;
    }
  }
  return parsed;
}

/** Build a safe, explicit run configuration from runtime configuration and argv. */
export function parseConfig(
  env: Record<string, string | undefined>,
  argv: readonly string[],
): RunConfig {
  const args = parseArgs(argv);
  const modes = ['preview', 'prepare', 'live'].filter((name) => args[name] === true);
  if (modes.length > 1) throw new Error('--preview, --prepare, and --live are mutually exclusive');
  const mode = (modes[0] ?? 'preview') as RunConfig['mode'];
  const claimId = typeof args.claim === 'string' ? args.claim.trim() : undefined;
  if (claimId && !CLAIM_ID.test(claimId)) {
    throw new Error('--claim must contain 1-100 letters, digits, dots, underscores, or hyphens');
  }
  if ((mode === 'prepare' || mode === 'live') && !claimId) {
    throw new Error(`--${mode} requires a non-empty --claim value`);
  }
  if (mode === 'preview' && claimId)
    throw new Error('--claim is only valid with --prepare or --live');
  if (args.force === true && mode !== 'prepare')
    throw new Error('--force is only valid with --prepare');

  const token = (env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (mode === 'live' && token === '') throw new Error('TELEGRAM_BOT_TOKEN is required for --live');

  const only =
    typeof args.only === 'string' ? args.only.split(',').map((value) => value.trim()) : undefined;
  if (only?.some((value) => value === ''))
    throw new Error('--only must name at least one poll kind');
  if (only && new Set(only).size !== only.length)
    throw new Error('--only must not name a poll kind twice');
  const unknownKind = only?.find((kind) => !ALL_KINDS.includes(kind as PollKind));
  if (unknownKind) {
    throw new Error(`unknown poll kind "${unknownKind}": expected ${ALL_KINDS.join(', ')}`);
  }

  const slots =
    typeof args.slots === 'string' ? args.slots.split(',').map((value) => value.trim()) : undefined;
  if (slots?.some((slot) => slot === '')) throw new Error('--slots must not contain empty values');
  if (slots && new Set(slots).size !== slots.length)
    throw new Error('--slots must not repeat a value');

  const configuredDestinations = destinationsFrom(env);
  const selectedAliases =
    typeof args.to === 'string' ? args.to.split(',').map((value) => value.trim()) : undefined;
  if (selectedAliases?.some((alias) => alias === ''))
    throw new Error('--to must name at least one alias');
  if (selectedAliases && new Set(selectedAliases).size !== selectedAliases.length) {
    throw new Error('--to must not name an alias twice');
  }
  const destinations = selectedAliases
    ? selectedAliases.map((alias) => {
        const destination = configuredDestinations.find((configured) => configured.alias === alias);
        if (!destination) throw new Error('--to names an unknown destination alias');
        return destination;
      })
    : configuredDestinations;

  return {
    token,
    destinations,
    targetMonth: typeof args.month === 'string' ? args.month : undefined,
    mode,
    claimId,
    force: args.force === true,
    offline: args.offline === true,
    kinds: (only ?? ALL_KINDS) as PollKind[],
    slots,
  };
}
