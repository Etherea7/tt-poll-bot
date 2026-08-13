import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ALL_KINDS } from './config.ts';
import type { PollKind } from './polls.ts';
import type { TelegramPoll, TelegramPollAnswer, TelegramUser } from './telegram.ts';

export const ATTENDANCE_PATH = 'state/attendance.json';

/** Months are retained this long past their final day. (R26) */
export const RETENTION_DAYS = 60;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALIAS = /^[a-z][a-z0-9-]{0,31}$/;
const USER_ID = /^\d+$/;
const KINDS: ReadonlySet<string> = new Set(ALL_KINDS);

/**
 * A single bookable slot. `slot` is null for polls whose sessions are a whole
 * date (Fridays, Sundays) and set for those split within a day (Saturdays by
 * time, holidays by AM/PM).
 */
export interface SessionRef {
  readonly date: string;
  readonly slot: string | null;
}

/**
 * One answer option as it was registered at send time.
 *
 * `session` is null for two different reasons, distinguished by `cmi`: the
 * shared opt-out answer (R12), or an option added by a member after the poll
 * was sent, which has no session meaning this system can infer (R13).
 */
export interface RegisteredOption {
  readonly persistentId: string;
  readonly label: string;
  readonly session: SessionRef | null;
  readonly cmi: boolean;
}

export interface RegisteredPoll {
  readonly alias: string;
  readonly month: string;
  readonly kind: PollKind;
  readonly messageId: number;
  readonly options: readonly RegisteredOption[];
}

export interface StoredUser {
  readonly firstName: string;
  readonly lastName?: string;
}

export interface RosterRecord {
  readonly messageId: number;
  /** SHA-256 of the last text this system sent, so R18 can skip a no-op edit. */
  readonly textHash: string;
}

export interface AttendanceState {
  readonly offset: number;
  readonly polls: Record<string, RegisteredPoll>;
  readonly users: Record<string, StoredUser>;
  /** pollId → userId → the persistent ids that user currently has selected. */
  readonly votes: Record<string, Record<string, readonly string[]>>;
  readonly rosters: Record<string, RosterRecord>;
  readonly lastSync: string | null;
}

/**
 * Telegram supplied a selection with no persistent ids. (R5)
 *
 * Falling back to positional `option_ids` would silently reassign members to
 * the wrong session whenever a member-added option shifts the list, so this
 * fails the run instead. Raised only when a non-empty selection arrives
 * without persistent ids; an empty selection is an unambiguous retraction.
 */
export class MissingPersistentIdError extends Error {
  readonly pollId: string;

  constructor(pollId: string) {
    super(
      `poll ${pollId} answered without option_persistent_ids; refusing to key attendance on option position`,
    );
    this.name = 'MissingPersistentIdError';
    this.pollId = pollId;
  }
}

export function emptyAttendanceState(): AttendanceState {
  return { offset: 0, polls: {}, users: {}, votes: {}, rosters: {}, lastSync: null };
}

/** The state key for one destination's roster in one month. */
export function rosterKey(alias: string, month: string): string {
  return `${alias}|${month}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSession(value: unknown, pollId: string): SessionRef | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new Error(`invalid attendance state: poll "${pollId}" has a malformed session`);
  }
  const { date, slot } = value;
  if (typeof date !== 'string' || !ISO_DATE.test(date)) {
    throw new Error(`invalid attendance state: poll "${pollId}" has a session without a date`);
  }
  if (slot !== null && slot !== undefined && typeof slot !== 'string') {
    throw new Error(`invalid attendance state: poll "${pollId}" has a malformed session slot`);
  }
  return { date, slot: typeof slot === 'string' ? slot : null };
}

function parseOption(value: unknown, pollId: string): RegisteredOption {
  if (!isRecord(value)) {
    throw new Error(`invalid attendance state: poll "${pollId}" has a malformed option`);
  }
  const { persistentId, label, session, cmi } = value;
  if (typeof persistentId !== 'string' || persistentId === '') {
    throw new Error(`invalid attendance state: poll "${pollId}" has an option without an id`);
  }
  if (typeof label !== 'string') {
    throw new Error(`invalid attendance state: option "${persistentId}" has no label`);
  }
  if (typeof cmi !== 'boolean') {
    throw new Error(`invalid attendance state: option "${persistentId}" has no cmi flag`);
  }
  return { persistentId, label, session: parseSession(session, pollId), cmi };
}

function parsePoll(value: unknown, pollId: string): RegisteredPoll {
  if (!isRecord(value)) {
    throw new Error(`invalid attendance state: poll "${pollId}" must be an object`);
  }
  const { alias, month, kind, messageId, options } = value;
  if (typeof alias !== 'string' || !ALIAS.test(alias)) {
    throw new Error(`invalid attendance state: poll "${pollId}" has an unsafe alias`);
  }
  if (typeof month !== 'string' || !MONTH.test(month)) {
    throw new Error(`invalid attendance state: poll "${pollId}" has a malformed month`);
  }
  if (typeof kind !== 'string' || !KINDS.has(kind)) {
    throw new Error(`invalid attendance state: poll "${pollId}" has an unknown kind`);
  }
  if (!Number.isSafeInteger(messageId)) {
    throw new Error(`invalid attendance state: poll "${pollId}" has no message id`);
  }
  if (!Array.isArray(options)) {
    throw new Error(`invalid attendance state: poll "${pollId}" has no options`);
  }
  return {
    alias,
    month,
    kind: kind as PollKind,
    messageId: messageId as number,
    options: options.map((option) => parseOption(option, pollId)),
  };
}

/** Validate strictly; malformed state must stop the run, never silently reset. */
export function parseAttendanceState(value: unknown): AttendanceState {
  if (!isRecord(value)) {
    throw new Error('invalid attendance state: expected a JSON object');
  }
  const { offset, polls, users, votes, rosters, lastSync } = value;

  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new Error('invalid attendance state: offset must be a non-negative integer');
  }
  for (const [name, section] of Object.entries({ polls, users, votes, rosters })) {
    if (!isRecord(section)) {
      throw new Error(`invalid attendance state: "${name}" must be an object`);
    }
  }
  if (lastSync !== null && typeof lastSync !== 'string') {
    throw new Error('invalid attendance state: lastSync must be a string or null');
  }

  const parsedPolls: Record<string, RegisteredPoll> = {};
  for (const [pollId, poll] of Object.entries(polls as Record<string, unknown>)) {
    parsedPolls[pollId] = parsePoll(poll, pollId);
  }

  const parsedUsers: Record<string, StoredUser> = {};
  for (const [userId, user] of Object.entries(users as Record<string, unknown>)) {
    if (!USER_ID.test(userId)) {
      throw new Error(`invalid attendance state: "${userId}" is not a Telegram user id`);
    }
    if (!isRecord(user) || typeof user.firstName !== 'string') {
      throw new Error(`invalid attendance state: user "${userId}" has no first name`);
    }
    parsedUsers[userId] =
      typeof user.lastName === 'string'
        ? { firstName: user.firstName, lastName: user.lastName }
        : { firstName: user.firstName };
  }

  const parsedVotes: Record<string, Record<string, readonly string[]>> = {};
  for (const [pollId, byUser] of Object.entries(votes as Record<string, unknown>)) {
    if (!isRecord(byUser)) {
      throw new Error(`invalid attendance state: votes for "${pollId}" must be an object`);
    }
    const parsedByUser: Record<string, readonly string[]> = {};
    for (const [userId, selection] of Object.entries(byUser)) {
      if (!USER_ID.test(userId)) {
        throw new Error(`invalid attendance state: "${userId}" is not a Telegram user id`);
      }
      if (!Array.isArray(selection) || selection.some((id) => typeof id !== 'string')) {
        throw new Error(`invalid attendance state: selection for user "${userId}" is malformed`);
      }
      parsedByUser[userId] = selection as string[];
    }
    parsedVotes[pollId] = parsedByUser;
  }

  const parsedRosters: Record<string, RosterRecord> = {};
  for (const [key, roster] of Object.entries(rosters as Record<string, unknown>)) {
    if (!isRecord(roster) || !Number.isSafeInteger(roster.messageId)) {
      throw new Error(`invalid attendance state: roster "${key}" has no message id`);
    }
    if (typeof roster.textHash !== 'string') {
      throw new Error(`invalid attendance state: roster "${key}" has no text hash`);
    }
    parsedRosters[key] = { messageId: roster.messageId as number, textHash: roster.textHash };
  }

  return {
    offset: offset as number,
    polls: parsedPolls,
    users: parsedUsers,
    votes: parsedVotes,
    rosters: parsedRosters,
    lastSync: lastSync as string | null,
  };
}

export function loadAttendanceState(path: string = ATTENDANCE_PATH): AttendanceState {
  if (!existsSync(path)) return emptyAttendanceState();
  return parseAttendanceState(JSON.parse(readFileSync(path, 'utf8')));
}

/** Atomically replace the file so a crash leaves the previous valid state. */
export function saveAttendanceState(state: AttendanceState, path: string = ATTENDANCE_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  renameSync(temporary, path);
}

/** Bind a delivered poll to its destination, month, and option meanings. (R10) */
export function registerPoll(
  state: AttendanceState,
  pollId: string,
  poll: RegisteredPoll,
): AttendanceState {
  return { ...state, polls: { ...state.polls, [pollId]: poll } };
}

function storeUser(
  users: Record<string, StoredUser>,
  user: TelegramUser,
): Record<string, StoredUser> {
  const stored: StoredUser =
    typeof user.last_name === 'string'
      ? { firstName: user.first_name ?? '', lastName: user.last_name }
      : { firstName: user.first_name ?? '' };
  return { ...users, [String(user.id)]: stored };
}

export interface ApplyOutcome {
  readonly state: AttendanceState;
  /** False when the update named a poll this system never registered. (R7) */
  readonly applied: boolean;
}

/**
 * Replace one member's selection for one poll. (R3, R4, R5, R7, R8)
 *
 * Telegram sends the member's complete current selection on every change, so
 * this overwrites rather than merges — which is also what makes it idempotent
 * under a reprocessed update.
 */
export function applyPollAnswer(state: AttendanceState, answer: TelegramPollAnswer): ApplyOutcome {
  // R7: an inbound update is never a source of configuration.
  if (!state.polls[answer.poll_id]) return { state, applied: false };
  if (!answer.user) return { state, applied: false };

  const selection = answer.option_persistent_ids;
  if (selection === undefined && (answer.option_ids?.length ?? 0) > 0) {
    throw new MissingPersistentIdError(answer.poll_id);
  }
  const chosen = selection ?? [];

  const forPoll = { ...state.votes[answer.poll_id] };
  const userId = String(answer.user.id);
  if (chosen.length === 0) {
    // R4: a retraction removes the member rather than storing an empty list.
    delete forPoll[userId];
  } else {
    forPoll[userId] = [...chosen];
  }

  return {
    state: {
      ...state,
      users: storeUser(state.users, answer.user),
      votes: { ...state.votes, [answer.poll_id]: forPoll },
    },
    applied: true,
  };
}

/**
 * Refresh a registered poll's option metadata. (R6, R13)
 *
 * Options this system did not send are recorded with no session, which is what
 * puts their voters under the roster's unresolved heading instead of dropping
 * them. Never registers a poll: registration happens only at send time.
 */
export function applyPollUpdate(state: AttendanceState, poll: TelegramPoll): AttendanceState {
  const registered = state.polls[poll.id];
  if (!registered) return state;

  const known = new Set(registered.options.map((option) => option.persistentId));
  const added: RegisteredOption[] = [];
  for (const option of poll.options) {
    if (!option.persistent_id || known.has(option.persistent_id)) continue;
    added.push({
      persistentId: option.persistent_id,
      label: option.text,
      session: null,
      cmi: false,
    });
  }
  if (added.length === 0) return state;

  return {
    ...state,
    polls: {
      ...state.polls,
      [poll.id]: { ...registered, options: [...registered.options, ...added] },
    },
  };
}

/** The last calendar day of a `YYYY-MM` month, as `YYYY-MM-DD`. */
function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  // Day 0 of the following month is the last day of this one, leap years
  // included. Pure calendar arithmetic; carries no time-zone meaning.
  return new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const parse = (date: string) =>
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/**
 * Drop months whose sessions ended more than `RETENTION_DAYS` ago. (R26)
 *
 * `today` is the Singapore calendar date. Users left unreferenced by any
 * remaining vote are dropped too, so identity is not retained past the
 * attendance that justified storing it.
 */
export function pruneAttendance(
  state: AttendanceState,
  today: string,
  retentionDays: number = RETENTION_DAYS,
): AttendanceState {
  const expired = (month: string) => daysBetween(monthEnd(month), today) > retentionDays;

  const polls: Record<string, RegisteredPoll> = {};
  for (const [pollId, poll] of Object.entries(state.polls)) {
    if (!expired(poll.month)) polls[pollId] = poll;
  }

  const votes: Record<string, Record<string, readonly string[]>> = {};
  for (const [pollId, byUser] of Object.entries(state.votes)) {
    if (polls[pollId]) votes[pollId] = byUser;
  }

  const rosters: Record<string, RosterRecord> = {};
  for (const [key, roster] of Object.entries(state.rosters)) {
    const month = key.slice(key.indexOf('|') + 1);
    if (!MONTH.test(month) || !expired(month)) rosters[key] = roster;
  }

  const referenced = new Set<string>();
  for (const byUser of Object.values(votes)) {
    for (const userId of Object.keys(byUser)) referenced.add(userId);
  }
  const users: Record<string, StoredUser> = {};
  for (const [userId, user] of Object.entries(state.users)) {
    if (referenced.has(userId)) users[userId] = user;
  }

  return { ...state, polls, votes, rosters, users };
}
