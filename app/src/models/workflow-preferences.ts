export enum ForkContributionTarget {
  Parent = 'parent',
  Self = 'self',
}

/**
 * How a repository's scheduled background task decides when to fire. Shared by
 * both auto-push and auto-pull.
 *
 * Fork feature (multi-repo dashboard — scheduled sync).
 */
export enum AutoPushScheduleMode {
  /** Push repeatedly, every `intervalMinutes` minutes. */
  Interval = 'interval',
  /** Push once per day at `dailyTime`, using the user's local clock. */
  Daily = 'daily',
}

/**
 * Per-repository configuration for scheduled (background) pushes.
 *
 * This is a fork feature (multi-repo dashboard): the app can periodically push
 * a repository on a timer and, if the user opts in, first auto-commit any
 * pending changes with a "standard" message. Both behaviors are OFF by default
 * — auto-committing without review is an explicit, opinionated user choice.
 *
 * The push can be scheduled in one of two ways (see `AutoPushScheduleMode`):
 * repeatedly on an interval, or once a day at a fixed local time.
 */
export type AutoPushPreferences = {
  /** Is scheduled push enabled for this repository? */
  readonly enabled: boolean

  /** Which scheduling strategy to use (interval vs. daily). */
  readonly mode: AutoPushScheduleMode

  /** How often to attempt a push, in minutes (used when mode is Interval). */
  readonly intervalMinutes: number

  /**
   * Local time-of-day for the daily push, as "HH:MM" (24-hour) in the user's
   * own timezone (used when mode is Daily).
   */
  readonly dailyTime: string

  /** Before pushing, auto-commit any pending changes with a default message? */
  readonly autoCommit: boolean

  /** The summary used for the automatic commit (falls back to a default). */
  readonly commitMessage?: string
}

/**
 * Per-repository configuration for scheduled (background) pulls.
 *
 * Fork feature (multi-repo dashboard): the app can periodically pull a
 * repository on a timer — handy for keeping many repos current (e.g. a daily
 * pull of everything first thing in the morning). OFF by default. The pull only
 * runs when there's a remote with a tracked upstream; a pull that fails (e.g.
 * local changes in the way) is reported, never forced.
 */
export type AutoPullPreferences = {
  /** Is scheduled pull enabled for this repository? */
  readonly enabled: boolean

  /** Which scheduling strategy to use (interval vs. daily). */
  readonly mode: AutoPushScheduleMode

  /** How often to attempt a pull, in minutes (used when mode is Interval). */
  readonly intervalMinutes: number

  /**
   * Local time-of-day for the daily pull, as "HH:MM" (24-hour) in the user's
   * own timezone (used when mode is Daily).
   */
  readonly dailyTime: string
}

/**
 * Collection of configurable settings regarding how the user may work with a repository.
 */
export type WorkflowPreferences = {
  /**
   * What repo does the user want to contribute to with this fork?
   */
  readonly forkContributionTarget?: ForkContributionTarget

  /**
   * Scheduled push (and optional auto-commit) configuration for this repository.
   */
  readonly autoPush?: AutoPushPreferences

  /**
   * Scheduled pull configuration for this repository.
   */
  readonly autoPull?: AutoPullPreferences
}

/** Default interval between scheduled pushes, in minutes. */
export const DefaultAutoPushIntervalMinutes = 30

/**
 * Lower bound for the scheduled push interval, to protect the user (and the
 * remote) from an overly aggressive timer.
 */
export const MinAutoPushIntervalMinutes = 5

/** Default local time-of-day ("HH:MM", 24-hour) for a daily scheduled push. */
export const DefaultAutoPushDailyTime = '18:00'

/** The summary used for an automatic commit when the user didn't set one. */
export const DefaultAutoCommitMessage = 'Auto-commit (GitHub Desktop)'

/** Default interval between scheduled pulls, in minutes. */
export const DefaultAutoPullIntervalMinutes = 30

/** Lower bound for the scheduled pull interval, in minutes. */
export const MinAutoPullIntervalMinutes = 5

/**
 * Default local time-of-day ("HH:MM", 24-hour) for a daily scheduled pull —
 * 06:00, to pull everything first thing in the morning.
 */
export const DefaultAutoPullDailyTime = '06:00'

/**
 * Parse a "HH:MM" (24-hour) local time string into its hour/minute components,
 * or return null if it isn't a valid time-of-day. Used both to validate user
 * input and to drive the daily scheduler.
 */
export function parseDailyTime(
  value: string
): { readonly hour: number; readonly minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (match === null) {
    return null
  }

  const hour = parseInt(match[1], 10)
  const minute = parseInt(match[2], 10)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return { hour, minute }
}

/**
 * Resolve a repository's auto-push preferences, filling in safe defaults for
 * anything not explicitly configured. Always returns a fully-populated object
 * so callers don't have to repeat the default/clamping logic.
 */
export function getAutoPushPreferences(
  preferences: WorkflowPreferences
): AutoPushPreferences {
  const autoPush = preferences.autoPush

  const dailyTime =
    autoPush?.dailyTime !== undefined &&
    parseDailyTime(autoPush.dailyTime) !== null
      ? autoPush.dailyTime
      : DefaultAutoPushDailyTime

  return {
    enabled: autoPush?.enabled ?? false,
    mode: autoPush?.mode ?? AutoPushScheduleMode.Interval,
    intervalMinutes: Math.max(
      MinAutoPushIntervalMinutes,
      autoPush?.intervalMinutes ?? DefaultAutoPushIntervalMinutes
    ),
    dailyTime,
    autoCommit: autoPush?.autoCommit ?? false,
    commitMessage: autoPush?.commitMessage,
  }
}

/**
 * Resolve a repository's auto-pull preferences, filling in safe defaults for
 * anything not explicitly configured. Mirrors `getAutoPushPreferences`.
 */
export function getAutoPullPreferences(
  preferences: WorkflowPreferences
): AutoPullPreferences {
  const autoPull = preferences.autoPull

  const dailyTime =
    autoPull?.dailyTime !== undefined &&
    parseDailyTime(autoPull.dailyTime) !== null
      ? autoPull.dailyTime
      : DefaultAutoPullDailyTime

  return {
    enabled: autoPull?.enabled ?? false,
    mode: autoPull?.mode ?? AutoPushScheduleMode.Interval,
    intervalMinutes: Math.max(
      MinAutoPullIntervalMinutes,
      autoPull?.intervalMinutes ?? DefaultAutoPullIntervalMinutes
    ),
    dailyTime,
  }
}
