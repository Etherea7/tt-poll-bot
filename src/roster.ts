import { createHash } from 'node:crypto';
import type { AttendanceState, SessionRef, StoredUser } from './attendance.ts';
import { formatMonthLabel } from './format.ts';

/** Telegram's message ceiling. (R21) */
export const MAX_MESSAGE_LENGTH = 4096;

/**
 * Identify the exact text last sent for a roster. (R18)
 *
 * Stored instead of the text itself: the roster would otherwise be duplicated
 * into committed state and re-diffed in Git on every vote.
 */
export function rosterTextHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const EMPTY_SESSION = 'nobody yet';
const UNRESOLVED_HEADING = 'Other options';
const OMISSION_NOTICE =
  'Names omitted: the full roster is longer than Telegram allows in one message.';

export interface SessionAttendance {
  readonly session: SessionRef;
  /** The option text members saw in the poll, reused verbatim. */
  readonly label: string;
  readonly attendees: readonly string[];
}

/** An option this system did not send, so its session meaning is unknown. (R13) */
export interface UnresolvedAttendance {
  readonly label: string;
  readonly attendees: readonly string[];
}

export interface RosterProjection {
  readonly month: string;
  readonly sessions: readonly SessionAttendance[];
  readonly unresolved: readonly UnresolvedAttendance[];
}

export interface RenderOptions {
  readonly syncedAt: Date | null;
  /**
   * Force the named rendering even when it overflows. Only tests need this —
   * production always lets `renderRoster` choose, which is what keeps R21's
   * guarantee from depending on a caller remembering to ask for it.
   */
  readonly degrade?: boolean;
}

/**
 * Display names for everyone appearing in one destination's roster. (R22)
 *
 * A bare first name reads best and is what the group uses. The last initial is
 * added only to the names that would otherwise be indistinguishable, so the
 * common case stays clean.
 */
function displayNames(
  users: Record<string, StoredUser>,
  userIds: ReadonlySet<string>,
): Map<string, string> {
  const firstNameCounts = new Map<string, number>();
  for (const userId of userIds) {
    const first = users[userId]?.firstName ?? '';
    firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
  }

  const names = new Map<string, string>();
  for (const userId of userIds) {
    const user = users[userId];
    if (!user) continue;
    const collides = (firstNameCounts.get(user.firstName) ?? 0) > 1;
    const initial = user.lastName?.trim().charAt(0) ?? '';
    names.set(
      userId,
      collides && initial !== '' ? `${user.firstName} ${initial}.` : user.firstName,
    );
  }
  return names;
}

/**
 * Collapse stored votes into the sessions of one destination and month.
 *
 * Only polls registered to `alias` are read, which is what keeps one group's
 * attendance out of another's roster. (R14)
 */
export function projectRoster(
  state: AttendanceState,
  alias: string,
  month: string,
): RosterProjection {
  const relevant = Object.entries(state.polls).filter(
    ([, poll]) => poll.alias === alias && poll.month === month,
  );

  const votersOf = (pollId: string, persistentId: string): string[] => {
    const byUser = state.votes[pollId] ?? {};
    const found: string[] = [];
    for (const [userId, selection] of Object.entries(byUser)) {
      if (selection.includes(persistentId)) found.push(userId);
    }
    return found;
  };

  // Collected as user ids first. Display names cannot be resolved until the
  // full set of *displayed* attendees is known, because R22 adds an initial
  // only for a collision the reader can actually see — someone who picked only
  // `cmi` is never rendered and so cannot collide with anyone.
  const ordered: Array<{
    sort: [string, string, number];
    session: SessionRef;
    label: string;
    voters: string[];
  }> = [];
  const unresolvedRaw: Array<{ label: string; voters: string[] }> = [];

  for (const [pollId, poll] of relevant) {
    poll.options.forEach((option, index) => {
      // R12: the opt-out answer is not a session and is not shown at all.
      if (option.cmi) return;
      const voters = votersOf(pollId, option.persistentId);
      if (!option.session) {
        unresolvedRaw.push({ label: option.label, voters });
        return;
      }
      ordered.push({
        sort: [option.session.date, pollId, index],
        session: option.session,
        label: option.label,
        voters,
      });
    });
  }

  const displayed = new Set<string>();
  for (const entry of ordered) for (const userId of entry.voters) displayed.add(userId);
  for (const entry of unresolvedRaw) for (const userId of entry.voters) displayed.add(userId);
  const names = displayNames(state.users, displayed);

  const render = (voters: readonly string[]): string[] =>
    voters
      .map((userId) => names.get(userId) ?? '')
      .filter((name) => name !== '')
      .sort((left, right) => left.localeCompare(right));

  const unresolved: UnresolvedAttendance[] = unresolvedRaw.map((entry) => ({
    label: entry.label,
    attendees: render(entry.voters),
  }));

  // Date first, then the order the options were registered in — which is the
  // order members saw them, and is stable when a slot label is not sortable.
  ordered.sort((left, right) => {
    if (left.sort[0] !== right.sort[0]) return left.sort[0] < right.sort[0] ? -1 : 1;
    if (left.sort[1] !== right.sort[1]) return left.sort[1] < right.sort[1] ? -1 : 1;
    return left.sort[2] - right.sort[2];
  });

  return {
    month,
    sessions: ordered.map((item) => ({
      session: item.session,
      label: item.label,
      attendees: render(item.voters),
    })),
    unresolved: unresolved.sort((left, right) => left.label.localeCompare(right.label)),
  };
}

function weekdayOf(isoDate: string): string {
  const day = new Date(
    Date.UTC(
      Number(isoDate.slice(0, 4)),
      Number(isoDate.slice(5, 7)) - 1,
      Number(isoDate.slice(8, 10)),
    ),
  ).getUTCDay();
  return WEEKDAYS[day] ?? '';
}

/** `14:35` in Singapore, the only place the roster is time-zone sensitive. (R20) */
function singaporeTime(instant: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}

function heading(projection: RosterProjection): string {
  const year = Number(projection.month.slice(0, 4));
  const month = Number(projection.month.slice(5, 7));
  return `TT attendance — ${formatMonthLabel(year, month)}`;
}

function footer(syncedAt: Date | null): string {
  return syncedAt === null ? 'not yet synced' : `updated ${singaporeTime(syncedAt)} SGT`;
}

function compose(
  projection: RosterProjection,
  syncedAt: Date | null,
  notice: string | null,
  render: (attendees: readonly string[]) => string,
): string {
  const lines: string[] = [heading(projection)];
  if (notice) lines.push(notice);
  lines.push('');

  for (const session of projection.sessions) {
    lines.push(
      `${weekdayOf(session.session.date)} ${session.label} — ${render(session.attendees)}`,
    );
  }

  if (projection.unresolved.length > 0) {
    lines.push('', UNRESOLVED_HEADING);
    for (const option of projection.unresolved) {
      lines.push(`${option.label} — ${render(option.attendees)}`);
    }
  }

  lines.push('', footer(syncedAt));
  return lines.join('\n');
}

/**
 * Even without names, the roster does not fit Telegram's message limit. (R21)
 *
 * Reachable because option labels may be up to 100 characters and members can
 * add options: four full polls of maximum-length labels render to well over
 * 4096 characters as counts alone. Sending it anyway would have Telegram reject
 * the edit every hour forever, so this refuses deterministically instead.
 */
export class RosterTooLargeError extends Error {
  readonly length: number;

  constructor(length: number) {
    super(
      `roster renders to ${length} characters without names, over Telegram's ${MAX_MESSAGE_LENGTH}-character limit; it cannot be sent without dropping sessions`,
    );
    this.name = 'RosterTooLargeError';
    this.length = length;
  }
}

/**
 * Render one destination's roster. (R19, R20, R21)
 *
 * When the named form would exceed Telegram's limit, every attendee list in the
 * message collapses to a count — sessions and unresolved options alike. Dropping
 * names wholesale keeps the roster honest; truncating it would silently erase
 * somebody's attendance. If even that does not fit, nothing is sent: no session
 * is dropped quietly to make room.
 */
export function renderRoster(projection: RosterProjection, options: RenderOptions): string {
  const named = compose(projection, options.syncedAt, null, (attendees) =>
    attendees.length === 0 ? EMPTY_SESSION : attendees.join(', '),
  );
  if (options.degrade === false || named.length <= MAX_MESSAGE_LENGTH) return named;

  const counted = compose(projection, options.syncedAt, OMISSION_NOTICE, (attendees) =>
    attendees.length === 0 ? EMPTY_SESSION : String(attendees.length),
  );
  if (counted.length > MAX_MESSAGE_LENGTH) throw new RosterTooLargeError(counted.length);
  return counted;
}
