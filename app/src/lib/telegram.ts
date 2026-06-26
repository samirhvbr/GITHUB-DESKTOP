/**
 * Minimal Telegram Bot API client. Used by the scheduled-push feature to report
 * what the automation did. Fork feature (multi-repo dashboard — scheduled push).
 */

export interface ISendTelegramResult {
  readonly ok: boolean
  readonly error?: string
}

/**
 * Send a plain-text message to a Telegram chat via the Bot API.
 *
 * Never throws — network, HTTP and API errors are returned as
 * `{ ok: false, error }` so callers (e.g. the scheduled push) can report
 * failures without their own flow being interrupted.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<ISendTelegramResult> {
  if (botToken.length === 0 || chatId.length === 0) {
    return { ok: false, error: 'Token do bot ou chat_id ausente.' }
  }

  // Telegram bot tokens (`<digits>:<alnum/_-/>`) are URL-path-safe, so they go
  // into the path verbatim — encoding the ':' would break the endpoint.
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    })

    if (!response.ok) {
      return {
        ok: false,
        error:
          (await readTelegramDescription(response)) ??
          `HTTP ${response.status} ${response.statusText}`,
      }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Best-effort extraction of Telegram's `description` field from an error body. */
async function readTelegramDescription(
  response: Response
): Promise<string | null> {
  try {
    const body: unknown = await response.json()
    if (
      body !== null &&
      typeof body === 'object' &&
      'description' in body &&
      typeof (body as { description: unknown }).description === 'string'
    ) {
      return (body as { description: string }).description
    }
  } catch {
    // Not JSON / unreadable — fall back to the HTTP status.
  }
  return null
}
