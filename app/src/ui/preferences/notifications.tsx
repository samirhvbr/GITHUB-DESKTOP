import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { TextBox } from '../lib/text-box'
import { Select } from '../lib/select'
import { Button } from '../lib/button'
import {
  ITelegramSettings,
  TelegramNotificationScope,
} from '../../models/telegram'
import {
  getNotificationSettingsUrl,
  supportsNotifications,
  supportsNotificationsPermissionRequest,
} from 'desktop-notifications'
import {
  getNotificationsPermission,
  requestNotificationsPermission,
} from '../main-process-proxy'

interface INotificationPreferencesProps {
  readonly notificationsEnabled: boolean
  readonly onNotificationsEnabledChanged: (checked: boolean) => void

  /** Global Telegram reporting settings (fork: scheduled-push notifications). */
  readonly telegram: ITelegramSettings
  /** Persist the non-secret Telegram settings (enabled/chat/scope). */
  readonly onTelegramSettingsChanged: (settings: {
    enabled: boolean
    chatId: string
    scope: TelegramNotificationScope
  }) => void
  /** Store, or clear when blank, the Telegram bot token (secure store). */
  readonly onTelegramBotTokenChanged: (token: string) => Promise<void>
  /** Send a test Telegram message; resolves to a human-readable result. */
  readonly onTestTelegramMessage: () => Promise<string>
}

interface INotificationPreferencesState {
  readonly suggestGrantNotificationPermission: boolean
  readonly warnNotificationsDenied: boolean
  readonly suggestConfigureNotifications: boolean

  // Local edit buffer for the Telegram section.
  readonly telegramEnabled: boolean
  readonly telegramChatId: string
  readonly telegramScope: TelegramNotificationScope
  /** Raw token input — write-only; never seeded from props. */
  readonly telegramToken: string
  readonly telegramBusy: boolean
  readonly telegramResult: string | null
}

export class Notifications extends React.Component<
  INotificationPreferencesProps,
  INotificationPreferencesState
> {
  public constructor(props: INotificationPreferencesProps) {
    super(props)

    this.state = {
      suggestGrantNotificationPermission: false,
      warnNotificationsDenied: false,
      suggestConfigureNotifications: false,
      telegramEnabled: props.telegram.enabled,
      telegramChatId: props.telegram.chatId,
      telegramScope: props.telegram.scope,
      telegramToken: '',
      telegramBusy: false,
      telegramResult: null,
    }
  }

  public componentDidMount() {
    this.updateNotificationsState()
  }

  private onNotificationsEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onNotificationsEnabledChanged(event.currentTarget.checked)
  }

  public render() {
    return (
      <DialogContent>
        <div className="advanced-section">
          <h2>Notifications</h2>
          <Checkbox
            label="Enable notifications"
            value={
              this.props.notificationsEnabled
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onNotificationsEnabledChanged}
          />
          <p className="settings-description">
            Allows the display of notifications when high-signal events take
            place in the current repository.{this.renderNotificationHint()}
          </p>
        </div>
        {this.renderTelegramSection()}
      </DialogContent>
    )
  }

  private onGrantNotificationPermission = async () => {
    await requestNotificationsPermission()
    this.updateNotificationsState()
  }

  private async updateNotificationsState() {
    const notificationsPermission = await getNotificationsPermission()
    this.setState({
      suggestGrantNotificationPermission:
        supportsNotificationsPermissionRequest() &&
        notificationsPermission === 'default',
      warnNotificationsDenied: notificationsPermission === 'denied',
      suggestConfigureNotifications: notificationsPermission === 'granted',
    })
  }

  private renderNotificationHint() {
    // No need to bother the user if their environment doesn't support our
    // notifications or if they've been explicitly disabled.
    if (!supportsNotifications() || !this.props.notificationsEnabled) {
      return null
    }

    const {
      suggestGrantNotificationPermission,
      warnNotificationsDenied,
      suggestConfigureNotifications,
    } = this.state

    if (suggestGrantNotificationPermission) {
      return (
        <>
          {' '}
          You need to{' '}
          <LinkButton onClick={this.onGrantNotificationPermission}>
            grant permission
          </LinkButton>{' '}
          to display these notifications from GitHub Desktop.
        </>
      )
    }

    const notificationSettingsURL = getNotificationSettingsUrl()

    if (notificationSettingsURL === null) {
      return null
    }

    if (warnNotificationsDenied) {
      return (
        <div className="setting-hint-warning">
          <span className="warning-icon">⚠️</span> GitHub Desktop has no
          permission to display notifications. Please, enable them in the{' '}
          <LinkButton uri={notificationSettingsURL}>
            Notifications Settings
          </LinkButton>
          .
        </div>
      )
    }

    const verb = suggestConfigureNotifications
      ? 'properly configured'
      : 'enabled'

    return (
      <>
        {' '}
        Make sure notifications are {verb} for GitHub Desktop in the{' '}
        <LinkButton uri={notificationSettingsURL}>
          Notifications Settings
        </LinkButton>
        .
      </>
    )
  }

  // --- Telegram reporting (fork: scheduled push) ---------------------------

  private onTelegramEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ telegramEnabled: event.currentTarget.checked })
  }

  private onTelegramChatIdChanged = (value: string) => {
    this.setState({ telegramChatId: value })
  }

  private onTelegramTokenChanged = (value: string) => {
    this.setState({ telegramToken: value })
  }

  private onTelegramScopeChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value
    this.setState({
      telegramScope:
        value === TelegramNotificationScope.ConflictBranchOnly
          ? TelegramNotificationScope.ConflictBranchOnly
          : TelegramNotificationScope.All,
    })
  }

  /** Persist the local edit buffer (settings + token) up to the store. */
  private async persistTelegram(): Promise<void> {
    this.props.onTelegramSettingsChanged({
      enabled: this.state.telegramEnabled,
      chatId: this.state.telegramChatId.trim(),
      scope: this.state.telegramScope,
    })

    const token = this.state.telegramToken.trim()
    if (token.length > 0) {
      await this.props.onTelegramBotTokenChanged(token)
      this.setState({ telegramToken: '' })
    }
  }

  private onTelegramSave = async () => {
    this.setState({ telegramBusy: true, telegramResult: null })
    await this.persistTelegram()
    this.setState({ telegramBusy: false, telegramResult: 'Configurações salvas.' })
  }

  private onTelegramTest = async () => {
    this.setState({ telegramBusy: true, telegramResult: null })
    // Persist first so the test uses the latest token / chat id.
    await this.persistTelegram()
    const result = await this.props.onTestTelegramMessage()
    this.setState({ telegramBusy: false, telegramResult: result })
  }

  private renderTelegramSection() {
    const tokenPlaceholder = this.props.telegram.hasToken
      ? 'Token salvo — preencha para substituir'
      : 'Cole o token do @BotFather'

    return (
      <div className="advanced-section">
        <h2>Telegram (push agendado)</h2>
        <Checkbox
          label="Reportar o push agendado no Telegram"
          value={
            this.state.telegramEnabled ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onTelegramEnabledChanged}
        />
        <p className="settings-description">
          Avisa, por um bot do Telegram, o que o push automático fez. O token do
          bot é guardado no cofre seguro do sistema.
        </p>
        <TextBox
          label="Token do bot"
          type="password"
          placeholder={tokenPlaceholder}
          value={this.state.telegramToken}
          onValueChanged={this.onTelegramTokenChanged}
        />
        <TextBox
          label="Chat ID"
          placeholder="ex.: 123456789 ou -100123456789"
          value={this.state.telegramChatId}
          onValueChanged={this.onTelegramChatIdChanged}
        />
        <Select
          label="O que reportar"
          value={this.state.telegramScope}
          onChange={this.onTelegramScopeChanged}
        >
          <option value={TelegramNotificationScope.All}>
            Tudo que o automático fizer
          </option>
          <option value={TelegramNotificationScope.ConflictBranchOnly}>
            Só quando subir em branch nova (conflito)
          </option>
        </Select>
        <div className="telegram-actions">
          <Button onClick={this.onTelegramSave} disabled={this.state.telegramBusy}>
            Salvar
          </Button>
          <Button
            onClick={this.onTelegramTest}
            disabled={this.state.telegramBusy}
          >
            Enviar teste
          </Button>
        </div>
        {this.state.telegramResult !== null && (
          <p className="settings-description">{this.state.telegramResult}</p>
        )}
      </div>
    )
  }
}
