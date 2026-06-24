import * as React from 'react'
import { DialogContent } from '../dialog'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { TextBox } from '../lib/text-box'
import { DefaultAutoCommitMessage } from '../../models/workflow-preferences'

interface IAutoPushSettingsProps {
  readonly enabled: boolean
  readonly intervalText: string
  readonly autoCommit: boolean
  readonly commitMessage: string
  readonly onEnabledChanged: (enabled: boolean) => void
  readonly onIntervalTextChanged: (text: string) => void
  readonly onAutoCommitChanged: (autoCommit: boolean) => void
  readonly onCommitMessageChanged: (message: string) => void
}

/**
 * Repository settings section for the fork's scheduled-push feature: a periodic
 * background push and, optionally, an automatic "standard" commit of pending
 * changes before each push.
 *
 * Both are OFF by default. The actual push only runs when there are commits
 * ahead of a tracked upstream and never force-pushes (see
 * `AppStore.autoPushRepository`).
 */
export class AutoPushSettings extends React.Component<IAutoPushSettingsProps> {
  public render() {
    const { enabled, autoCommit } = this.props

    return (
      <DialogContent>
        <Checkbox
          label="Push automático agendado"
          value={enabled ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onEnabledChanged}
        />
        <p className="auto-push-description">
          Faz push deste repositório periodicamente, em segundo plano — apenas
          quando há commits à frente de um upstream configurado. Nunca faz
          force-push.
        </p>

        <TextBox
          label="Intervalo (minutos)"
          value={this.props.intervalText}
          onValueChanged={this.props.onIntervalTextChanged}
          disabled={!enabled}
        />

        <Checkbox
          label="Auto-commit das alterações pendentes antes do push"
          value={autoCommit ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onAutoCommitChanged}
          disabled={!enabled}
        />
        <p className="auto-push-description">
          Commita tudo que estiver pendente com uma mensagem padrão antes de cada
          push. Use com cautela: esse commit não passa por revisão.
        </p>

        <TextBox
          label="Mensagem do commit automático"
          placeholder={DefaultAutoCommitMessage}
          value={this.props.commitMessage}
          onValueChanged={this.props.onCommitMessageChanged}
          disabled={!enabled || !autoCommit}
        />
      </DialogContent>
    )
  }

  private onEnabledChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.props.onEnabledChanged(event.currentTarget.checked)
  }

  private onAutoCommitChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.props.onAutoCommitChanged(event.currentTarget.checked)
  }
}
