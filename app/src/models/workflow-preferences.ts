export enum ForkContributionTarget {
  Parent = 'parent',
  Self = 'self',
}

/**
 * Per-repository configuration for scheduled (background) pushes.
 *
 * This is a fork feature (multi-repo dashboard): the app can periodically push
 * a repository on a timer and, if the user opts in, first auto-commit any
 * pending changes with a "standard" message. Both behaviors are OFF by default
 * — auto-committing without review is an explicit, opinionated user choice.
 */
export type AutoPushPreferences = {
  /** Is scheduled push enabled for this repository? */
  readonly enabled: boolean

  /** How often to attempt a push, in minutes. */
  readonly intervalMinutes: number

  /** Before pushing, auto-commit any pending changes with a default message? */
  readonly autoCommit: boolean

  /** The summary used for the automatic commit (falls back to a default). */
  readonly commitMessage?: string
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
}

/** Default interval between scheduled pushes, in minutes. */
export const DefaultAutoPushIntervalMinutes = 30

/**
 * Lower bound for the scheduled push interval, to protect the user (and the
 * remote) from an overly aggressive timer.
 */
export const MinAutoPushIntervalMinutes = 5

/** The summary used for an automatic commit when the user didn't set one. */
export const DefaultAutoCommitMessage = 'Auto-commit (GitHub Desktop)'

/**
 * Resolve a repository's auto-push preferences, filling in safe defaults for
 * anything not explicitly configured. Always returns a fully-populated object
 * so callers don't have to repeat the default/clamping logic.
 */
export function getAutoPushPreferences(
  preferences: WorkflowPreferences
): AutoPushPreferences {
  const autoPush = preferences.autoPush

  return {
    enabled: autoPush?.enabled ?? false,
    intervalMinutes: Math.max(
      MinAutoPushIntervalMinutes,
      autoPush?.intervalMinutes ?? DefaultAutoPushIntervalMinutes
    ),
    autoCommit: autoPush?.autoCommit ?? false,
    commitMessage: autoPush?.commitMessage,
  }
}
