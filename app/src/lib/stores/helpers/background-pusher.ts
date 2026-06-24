import { Repository } from '../../../models/repository'

/**
 * An upper bound to the skew that should be applied to the push interval to
 * prevent multiple repositories from accidentally syncing up and all firing at
 * the exact same instant.
 */
const SkewUpperBound = 30 * 1000

/**
 * Handles periodic background pushes for a single repository.
 *
 * Fork feature (multi-repo dashboard — scheduled push). Mirrors
 * `BackgroundFetcher`: a self-rescheduling `setTimeout` loop with a small random
 * skew. Unlike the fetcher there's no server-provided poll interval — the
 * cadence is the per-repository, user-configured interval.
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
    /** How often to attempt a push, in milliseconds. */
    private readonly intervalMs: number,
    private readonly push: (repository: Repository) => Promise<void>,
    private readonly shouldPush: (repository: Repository) => boolean
  ) {}

  /**
   * Start the background push loop. The first attempt happens after one full
   * interval (never immediately) so enabling the feature doesn't trigger a
   * surprise push right away.
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
    return this.intervalMs + skewInterval()
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
