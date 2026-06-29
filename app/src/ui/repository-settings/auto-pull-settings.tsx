import * as React from 'react'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { AutoPushScheduleMode } from '../../models/workflow-preferences'

interface IAutoPullSettingsProps {
  readonly enabled: boolean
  readonly mode: AutoPushScheduleMode
  readonly intervalText: string
  readonly dailyTime: string
  readonly onEnabledChanged: (enabled: boolean) => void
  readonly onModeChanged: (mode: AutoPushScheduleMode) => void
  readonly onIntervalTextChanged: (text: string) => void
  readonly onDailyTimeChanged: (time: string) => void

  /**
   * Run the scheduled-pull flow right now with the current settings (without
   * waiting for the timer). Resolves with a short result message.
   */
  readonly onTestNow: () => Promise<string>
}

interface IAutoPullSettingsState {
  readonly testing: boolean
  readonly testResult: string | null
}

/**
 * Repository settings section for the fork's scheduled-pull feature: a periodic
 * background pull, either on a fixed interval or once a day at a specific local
 * time. OFF by default. The pull only runs when there's a remote with a tracked
 * upstream and never forces anything (see `AppStore.runScheduledPull`).
 */
export class AutoPullSettings extends React.Component<
  IAutoPullSettingsProps,
  IAutoPullSettingsState
> {
  public constructor(props: IAutoPullSettingsProps) {
    super(props)
    this.state = { testing: false, testResult: null }
  }

  public render() {
    const { enabled, mode } = this.props

    return (
      <DialogContent>
        <Checkbox
          label="Pull automático agendado"
          value={enabled ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onEnabledChanged}
        />
        <p className="auto-push-description">
          Faz pull deste repositório em segundo plano, mantendo-o atualizado com
          o upstream. Só roda quando há um remote com upstream rastreado.
        </p>

        <Select
          label="Quando fazer o pull"
          value={mode}
          onChange={this.onModeChanged}
        >
          <option value={AutoPushScheduleMode.Interval}>A cada X minutos</option>
          <option value={AutoPushScheduleMode.Daily}>
            Todo dia em um horário fixo
          </option>
        </Select>

        {mode === AutoPushScheduleMode.Daily ? (
          <TextBox
            type="time"
            label="Horário do pull (todos os dias)"
            value={this.props.dailyTime}
            onValueChanged={this.props.onDailyTimeChanged}
          />
        ) : (
          <TextBox
            label="Intervalo (minutos)"
            value={this.props.intervalText}
            onValueChanged={this.props.onIntervalTextChanged}
          />
        )}

        {mode === AutoPushScheduleMode.Daily && (
          <p className="auto-push-description">
            Usa o relógio local do seu computador. Se ele estiver desligado ou
            suspenso na hora marcada, o pull acontece assim que voltar.
          </p>
        )}

        <div className="auto-push-test">
          <Button onClick={this.onTestNow} disabled={this.state.testing}>
            {this.state.testing ? 'Testando…' : 'Testar agora'}
          </Button>
          {this.state.testResult !== null && (
            <p className="auto-push-test-result">{this.state.testResult}</p>
          )}
        </div>
        <p className="auto-push-description">
          "Testar agora" roda o pull na hora, sem esperar o agendamento.
        </p>
      </DialogContent>
    )
  }

  private onEnabledChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.props.onEnabledChanged(event.currentTarget.checked)
  }

  private onModeChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.props.onModeChanged(event.currentTarget.value as AutoPushScheduleMode)
  }

  private onTestNow = async () => {
    this.setState({ testing: true, testResult: null })
    try {
      const result = await this.props.onTestNow()
      this.setState({ testing: false, testResult: result })
    } catch (e) {
      this.setState({
        testing: false,
        testResult: `Erro: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }
}
