import { Repository } from '../../../models/repository'

/**
 * An upper bound to the skew that should be applied to the push interval to
 * prevent multiple repositories from accidentally syncing up and all firing at
 * the exact same instant.
 */
const SkewUpperBound = 30 * 1000

/**
 * Describes when a `BackgroundPusher` should fire:
 *
 *  - `interval`: repeatedly, every `intervalMs` milliseconds.
 *  - `daily`: once a day at a fixed local time (`hour`:`minute`, the user's own
 *    clock).
 */
export type PushSchedule =
  | { readonly kind: 'interval'; readonly intervalMs: number }
  | { readonly kind: 'daily'; readonly hour: number; readonly minute: number }

/**
 * Handles a periodic background task for a single repository — used by both
 * scheduled push and scheduled pull (the task to run is injected, so the same
 * timer drives either one).
 *
 * Fork feature (multi-repo dashboard — scheduled sync). Mirrors
 * `BackgroundFetcher`: a self-rescheduling `setTimeout` loop with a small random
 * skew. Unlike the fetcher there's no server-provided poll interval — the
 * cadence is the per-repository, user-configured schedule, which is either a
 * fixed interval or a daily local time (see `PushSchedule`).
 *
 * The actual push (and optional auto-commit) plus the decision of whether to
 * push are injected so this class stays free of git/store concerns. See
 * `AppStore._autoPushRepository` and `AppStore.reconcileBackgroundPushers`.
 */
export class BackgroundPusher {
  /** The handle for our setTimeout invocation. */
  private timeoutHandle: number | null = null

  /** Flag to indicate whether `stop` has been called. */
  private stopped = false

  public constructor(
    private readonly repository: Repository,
    /** When this pusher should fire (a fixed interval or a daily local time). */
    private readonly schedule: PushSchedule,
    private readonly push: (repository: Repository) => Promise<void>,
    private readonly shouldPush: (repository: Repository) => boolean
  ) {}

  /**
   * Start the background push loop. The first attempt happens after one full
   * interval (or at the next occurrence of the daily time) — never immediately
   * — so enabling the feature doesn't trigger a surprise push right away.
   */
  public start() {
    if (this.stopped) {
      return
    }

    this.timeoutHandle = window.setTimeout(
      () => this.performAndSchedulePush(),
      this.nextDelay()
    )
  }

  /**
   * Stop background pushing. Once this is called, the pusher cannot be
   * restarted (create a new one instead).
   */
  public stop() {
    this.stopped = true

    if (this.timeoutHandle !== null) {
      window.clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
  }

  private nextDelay(): number {
    const base =
      this.schedule.kind === 'interval'
        ? this.schedule.intervalMs
        : millisecondsUntilNextDailyTime(
            this.schedule.hour,
            this.schedule.minute
          )

    return base + skewInterval()
  }

  /** Perform a push and schedule the next one. */
  private async performAndSchedulePush(): Promise<void> {
    if (this.stopped) {
      return
    }

    if (this.shouldPush(this.repository)) {
      try {
        await this.push(this.repository)
      } catch (e) {
        log.error(
          `Error performing scheduled push for '${this.repository.name}'`,
          e
        )
      }
    }

    if (this.stopped) {
      return
    }

    this.timeoutHandle = window.setTimeout(
      () => this.performAndSchedulePush(),
      this.nextDelay()
    )
  }
}

/**
 * Milliseconds from now until the next occurrence of the given local
 * time-of-day (the user's own clock). If that time has already passed today,
 * the next occurrence is tomorrow.
 *
 * Because this is recomputed before every scheduled push, the timer naturally
 * re-aligns with the wall clock each day. And if the machine was asleep at the
 * target time, the pending `setTimeout` simply fires once it wakes.
 */
function millisecondsUntilNextDailyTime(hour: number, minute: number): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }

  return next.getTime() - now.getTime()
}

let _skewInterval: number | null = null

/**
 * The milliseconds by which the push interval should be skewed, to prevent
 * clients from accidentally syncing up.
 */
function skewInterval(): number {
  if (_skewInterval !== null) {
    return _skewInterval
  }

  // We don't need cryptographically secure random numbers for the skew.
  // eslint-disable-next-line insecure-random
  const skew = Math.ceil(Math.random() * SkewUpperBound)
  _skewInterval = skew
  return skew
}
