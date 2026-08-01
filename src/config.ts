import type { PollKind } from './polls.ts';

export const ALL_KINDS: readonly PollKind[] = ['fridays', 'saturdays', 'holidays'];

export interface RunConfig {
  readonly token: string;
  readonly chatIds: readonly string[];
  readonly targetMonth: string | undefined;
  readonly preview: boolean;
  readonly force: boolean;
  readonly offline: boolean;
  readonly kinds: readonly PollKind[];
  readonly slots: readonly string[] | undefined;
}

/**
 * Build a run configuration from environment and arguments. (R24, R32)
 *
 * Destinations come only from configuration — there is no code path that
 * derives one from a Telegram response. (R13)
 *
 * In preview mode the token may be absent: preview never contacts Telegram,
 * and requiring a secret to render text would discourage using it.
 */
export function parseConfig(
  env: Record<string, string | undefined>,
  argv: readonly string[],
): RunConfig {
  const hasFlag = (name: string) => argv.includes(`--${name}`);
  const flagValue = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };

  const preview = hasFlag('preview');

  // Preview never contacts Telegram, so requiring the secret would only
  // discourage using the safest mode.
  const token = (env.TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!preview && token === '') {
    throw new Error('TELEGRAM_BOT_TOKEN is required for a live run');
  }

  const chatIds = (env.TELEGRAM_GROUP_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (chatIds.length === 0) {
    throw new Error('TELEGRAM_GROUP_IDS must list at least one destination chat id');
  }

  const only = flagValue('only');
  let kinds: readonly PollKind[] = ALL_KINDS;
  if (only !== undefined) {
    const requested = only
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    for (const kind of requested) {
      if (!ALL_KINDS.includes(kind as PollKind)) {
        throw new Error(`unknown poll kind "${kind}": expected ${ALL_KINDS.join(', ')}`);
      }
    }
    kinds = requested as PollKind[];
  }

  const slots = flagValue('slots');

  return {
    token,
    chatIds,
    targetMonth: flagValue('month'),
    preview,
    force: hasFlag('force'),
    offline: hasFlag('offline'),
    kinds,
    slots: slots ? slots.split(',').map((value) => value.trim()) : undefined,
  };
}
