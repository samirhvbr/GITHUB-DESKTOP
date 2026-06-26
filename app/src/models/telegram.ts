/**
 * Telegram reporting for the scheduled-push feature. Fork feature (multi-repo
 * dashboard — scheduled push).
 */

/** Which scheduled-push events get reported to Telegram. */
export enum TelegramNotificationScope {
  /**
   * Everything the scheduled push does: pushed, nothing to push, no upstream,
   * error, and (Phase B) a new branch created on conflict.
   */
  All = 'all',
  /**
   * Only when the scheduled push had to create a new branch because the default
   * branch had diverged (Phase B). Routine successes are not reported.
   */
  ConflictBranchOnly = 'conflict-only',
}

/**
 * Global Telegram reporting settings — one bot/chat for all repositories.
 *
 * The raw bot token is a secret and lives in the secure token store, never in
 * app state. `hasToken` only reflects whether one is configured.
 */
export interface ITelegramSettings {
  /** Master switch for Telegram reporting. */
  readonly enabled: boolean
  /** Destination chat id the bot sends messages to. */
  readonly chatId: string
  /** Which scheduled-push events to report. */
  readonly scope: TelegramNotificationScope
  /** Whether a bot token is stored in the secure token store. */
  readonly hasToken: boolean
}

export const DefaultTelegramSettings: ITelegramSettings = {
  enabled: false,
  chatId: '',
  scope: TelegramNotificationScope.All,
  hasToken: false,
}

/** Parse a persisted scope string, falling back to the default (`all`). */
export function parseTelegramScope(value: string | null): TelegramNotificationScope {
  return value === TelegramNotificationScope.ConflictBranchOnly
    ? TelegramNotificationScope.ConflictBranchOnly
    : TelegramNotificationScope.All
}
