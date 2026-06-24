import * as React from 'react'
import pLimit from 'p-limit'

import { UiView } from '../ui-view'
import { Repository, ILocalRepositoryState } from '../../models/repository'
import { getAutoPushPreferences } from '../../models/workflow-preferences'
import { CloningRepository } from '../../models/cloning-repository'
import { IAheadBehind } from '../../models/branch'
import { Octicon, syncClockwise } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { TooltippedContent } from '../lib/tooltipped-content'
import { Dispatcher } from '../dispatcher'

/**
 * How many repositories to pull/push at the same time during a batch action.
 * Git sync is mostly network-bound and the store isolates push/pull/fetch state
 * per repository, so a small amount of concurrency speeds things up without
 * overwhelming the machine or the network.
 */
const MaxConcurrentSyncs = 3

/**
 * How many repository indicators to refresh at the same time. Refreshing is
 * lighter than a full sync (mostly a local `git status`), so a slightly higher
 * concurrency is fine.
 */
const MaxConcurrentRefreshes = 6

interface IDashboardRow {
  readonly repository: Repository
  readonly changedFilesCount: number
  readonly aheadBehind: IAheadBehind | null
}

/** The per-repository state of an in-flight or finished batch operation. */
interface IRepoOp {
  readonly kind: 'pull' | 'push'
  readonly status: 'running' | 'done' | 'error'
  readonly message?: string
}

function hasDemand(row: IDashboardRow): boolean {
  return row.changedFilesCount > 0 || (row.aheadBehind?.behind ?? 0) > 0
}

/** A repository can only be pulled/pushed in batch if it has a tracked upstream
 *  (an ahead/behind is only computed when an upstream tracking branch exists).
 *  This also keeps batch push from popping the "Publish repository" dialog for
 *  every repo that was never pushed. */
function canSyncInBatch(row: IDashboardRow): boolean {
  return row.aheadBehind !== null
}

interface IMultiRepoDashboardRowProps {
  readonly row: IDashboardRow
  readonly selected: boolean
  readonly op: IRepoOp | undefined
  readonly disabled: boolean
  readonly onToggleSelected: (repository: Repository) => void
  readonly onOpen: (repository: Repository) => void
  readonly autoPushEnabled: boolean
  readonly onToggleAutoPush: (repository: Repository) => void
}

class MultiRepoDashboardRow extends React.Component<IMultiRepoDashboardRowProps> {
  private onToggle = () => this.props.onToggleSelected(this.props.row.repository)
  private onOpen = () => this.props.onOpen(this.props.row.repository)
  private onToggleAutoPush = () =>
    this.props.onToggleAutoPush(this.props.row.repository)

  private renderOp() {
    const op = this.props.op
    if (op === undefined) {
      return null
    }

    const verb = op.kind === 'pull' ? 'Pull' : 'Push'

    if (op.status === 'running') {
      return (
        <TooltippedContent
          tagName="span"
          className="op-status running"
          tooltip={`${verb} em andamento…`}
        >
          <Octicon className="spin" symbol={syncClockwise} />
        </TooltippedContent>
      )
    }

    if (op.status === 'done') {
      return (
        <TooltippedContent
          tagName="span"
          className="op-status done"
          tooltip={`${verb} concluído`}
        >
          <Octicon symbol={octicons.check} />
        </TooltippedContent>
      )
    }

    return (
      <TooltippedContent
        tagName="span"
        className="op-status error"
        tooltip={op.message ? `${verb} falhou: ${op.message}` : `${verb} falhou`}
      >
        <Octicon symbol={octicons.x} />
      </TooltippedContent>
    )
  }

  private renderAutoPushToggle() {
    const enabled = this.props.autoPushEnabled
    return (
      <TooltippedContent
        tagName="span"
        className={`auto-push-toggle ${enabled ? 'on' : 'off'}`}
        tooltip={
          enabled
            ? 'Push automático: ligado (clique para desligar)'
            : 'Push automático: desligado (clique para ligar)'
        }
      >
        <button
          type="button"
          className="auto-push-button"
          onClick={this.onToggleAutoPush}
          disabled={this.props.disabled}
          aria-pressed={enabled}
          aria-label="Alternar push automático"
        >
          <Octicon symbol={syncClockwise} />
        </button>
      </TooltippedContent>
    )
  }

  public render() {
    const { repository, changedFilesCount, aheadBehind } = this.props.row
    const ahead = aheadBehind?.ahead ?? 0
    const behind = aheadBehind?.behind ?? 0
    const hasChanges = changedFilesCount > 0
    const isClean = !hasChanges && ahead === 0 && behind === 0

    return (
      <div className="repo-row">
        <Checkbox
          className="repo-select"
          value={this.props.selected ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onToggle}
          disabled={this.props.disabled}
        />

        <button type="button" className="repo-open" onClick={this.onOpen}>
          <Octicon className="repo-icon" symbol={octicons.repo} />
          <span className="repo-name">{repository.name}</span>
        </button>

        {this.renderOp()}

        {this.renderAutoPushToggle()}

        <span className="repo-indicators">
          {hasChanges && (
            <TooltippedContent
              tagName="span"
              className="indicator changes"
              tooltip={`${changedFilesCount} arquivo(s) com alterações não commitadas`}
            >
              <Octicon symbol={octicons.dotFill} />
              {changedFilesCount}
            </TooltippedContent>
          )}
          {behind > 0 && (
            <TooltippedContent
              tagName="span"
              className="indicator behind"
              tooltip={`${behind} commit(s) atrás do remoto — precisa de pull`}
            >
              <Octicon symbol={octicons.arrowDown} />
              {behind}
            </TooltippedContent>
          )}
          {ahead > 0 && (
            <TooltippedContent
              tagName="span"
              className="indicator ahead"
              tooltip={`${ahead} commit(s) à frente do remoto — precisa de push`}
            >
              <Octicon symbol={octicons.arrowUp} />
              {ahead}
            </TooltippedContent>
          )}
          {isClean && (
            <TooltippedContent
              tagName="span"
              className="indicator clean"
              tooltip="Atualizado"
            >
              <Octicon symbol={octicons.check} />
            </TooltippedContent>
          )}
        </span>
      </div>
    )
  }
}

interface IMultiRepoDashboardProps {
  /** Todos os repositórios rastreados pelo app (os em clonagem são ignorados). */
  readonly repositories: ReadonlyArray<Repository | CloningRepository>

  /**
   * Estado agregado por repositório (ahead/behind + nº de alterações não
   * commitadas), mantido pelo `RepositoryIndicatorUpdater`.
   */
  readonly localRepositoryStateLookup: Map<number, ILocalRepositoryState>

  readonly dispatcher: Dispatcher

  /** Chamado quando o usuário escolhe um repositório para abrir. */
  readonly onSelectRepository: (repository: Repository) => void

  /** Chamado para fechar o painel e voltar ao repositório selecionado. */
  readonly onClose: () => void
}

interface IMultiRepoDashboardState {
  /** Ids dos repositórios marcados (para as ações em lote). */
  readonly selectedRepoIds: ReadonlySet<number>

  /** Há uma operação em lote em andamento? */
  readonly isRunning: boolean

  /** Resultado/progresso por repositório da última ação em lote. */
  readonly ops: ReadonlyMap<number, IRepoOp>

  /** Mensagem informativa da última ação (ex.: pulados sem upstream). */
  readonly notice: string | null

  /** Mostra a tela de relatório de status no lugar da lista. */
  readonly showReport: boolean

  /** Feedback transitório do botão "Copiar relatório". */
  readonly reportCopied: boolean

  /** Está atualizando os indicadores (status) de todos os repos? */
  readonly isRefreshing: boolean
}

/**
 * Painel agregado que lista todos os repositórios de uma vez, destacando os que
 * têm demanda (alterações pendentes de commit ou commits atrás do remoto) e
 * permitindo fazer **Pull/Push em lote** nos repositórios selecionados.
 */
export class MultiRepoDashboard extends React.Component<
  IMultiRepoDashboardProps,
  IMultiRepoDashboardState
> {
  public constructor(props: IMultiRepoDashboardProps) {
    super(props)
    this.state = {
      selectedRepoIds: new Set<number>(),
      isRunning: false,
      ops: new Map<number, IRepoOp>(),
      notice: null,
      showReport: false,
      reportCopied: false,
      isRefreshing: false,
    }
  }

  public componentDidMount() {
    // The localRepositoryStateLookup starts empty after each app start and is
    // only repopulated by the periodic RepositoryIndicatorUpdater (~15 min). So
    // refresh every repo's indicator right away — that's mostly a local
    // `git status`, which makes the dashboard reflect real ahead/behind/changes
    // instead of "unknown" for repos not yet visited.
    this.refreshAllIndicators()
  }

  private refreshAllIndicators = async () => {
    const repos = this.props.repositories.filter(
      (r): r is Repository => r instanceof Repository
    )

    if (repos.length === 0 || this.state.isRefreshing) {
      return
    }

    this.setState({ isRefreshing: true })

    const limit = pLimit(MaxConcurrentRefreshes)
    await Promise.all(
      repos.map(repo =>
        limit(() =>
          this.props.dispatcher.refreshRepositoryIndicator(repo).catch(e => {
            log.error(
              `[MultiRepoDashboard] indicator refresh failed for '${repo.name}'`,
              e
            )
          })
        )
      )
    )

    this.setState({ isRefreshing: false })
  }

  private onRefresh = () => this.refreshAllIndicators()

  private getRows(): ReadonlyArray<IDashboardRow> {
    const rows = new Array<IDashboardRow>()

    for (const repo of this.props.repositories) {
      if (!(repo instanceof Repository)) {
        continue
      }

      const state = this.props.localRepositoryStateLookup.get(repo.id)

      rows.push({
        repository: repo,
        changedFilesCount: state?.changedFilesCount ?? 0,
        aheadBehind: state?.aheadBehind ?? null,
      })
    }

    // Repositórios com demanda primeiro; depois ordem alfabética.
    return rows.sort((x, y) => {
      const dx = hasDemand(x) ? 0 : 1
      const dy = hasDemand(y) ? 0 : 1

      return dx !== dy
        ? dx - dy
        : x.repository.name.localeCompare(y.repository.name)
    })
  }

  private onToggleSelected = (repository: Repository) => {
    if (this.state.isRunning) {
      return
    }

    const next = new Set(this.state.selectedRepoIds)
    if (next.has(repository.id)) {
      next.delete(repository.id)
    } else {
      next.add(repository.id)
    }
    this.setState({ selectedRepoIds: next })
  }

  private onToggleAutoPush = (repository: Repository) => {
    const current = getAutoPushPreferences(repository.workflowPreferences)
    this.props.dispatcher
      .updateRepositoryWorkflowPreferences(repository, {
        ...repository.workflowPreferences,
        autoPush: { ...current, enabled: !current.enabled },
      })
      .catch(e =>
        log.error('[MultiRepoDashboard] failed to toggle auto-push', e)
      )
  }

  private onToggleSelectAll = () => {
    if (this.state.isRunning) {
      return
    }

    const rows = this.getRows()
    const allSelected =
      rows.length > 0 &&
      rows.every(r => this.state.selectedRepoIds.has(r.repository.id))

    this.setState({
      selectedRepoIds: allSelected
        ? new Set<number>()
        : new Set<number>(rows.map(r => r.repository.id)),
    })
  }

  private setOp(repoId: number, op: IRepoOp) {
    this.setState(prev => {
      const ops = new Map(prev.ops)
      ops.set(repoId, op)
      return { ops }
    })
  }

  private runBatch = async (kind: 'pull' | 'push') => {
    if (this.state.isRunning) {
      return
    }

    const { selectedRepoIds } = this.state
    const selected = this.getRows().filter(r =>
      selectedRepoIds.has(r.repository.id)
    )
    const actionable = selected.filter(canSyncInBatch)
    const skipped = selected.length - actionable.length

    if (actionable.length === 0) {
      this.setState({
        notice:
          skipped > 0
            ? `Nenhum dos selecionados tem upstream para ${
                kind === 'pull' ? 'pull' : 'push'
              } (${skipped} ignorado(s)).`
            : 'Selecione ao menos um repositório.',
      })
      return
    }

    this.setState({ isRunning: true, ops: new Map(), notice: null })

    let done = 0
    let errors = 0

    // Sync a few repositories at a time instead of one-by-one.
    const limit = pLimit(MaxConcurrentSyncs)

    await Promise.all(
      actionable.map(row =>
        limit(async () => {
          const repo = row.repository
          this.setOp(repo.id, { kind, status: 'running' })

          try {
            if (kind === 'pull') {
              await this.props.dispatcher.pull(repo)
            } else {
              await this.props.dispatcher.push(repo)
            }
            // Refresh this repo's indicator so the dashboard reflects the new
            // ahead/behind right away instead of waiting for the periodic updater.
            await this.props.dispatcher.refreshRepositoryIndicator(repo)
            this.setOp(repo.id, { kind, status: 'done' })
            done++
          } catch (e) {
            // Also surface the failure in the app log (e.g.
            // %APPDATA%/GitHub Desktop[-dev]/logs) so batch errors are
            // traceable beyond the per-row indicator/tooltip.
            log.error(
              `[MultiRepoDashboard] ${kind} failed for '${repo.name}'`,
              e
            )
            this.setOp(repo.id, {
              kind,
              status: 'error',
              message: e instanceof Error ? e.message : String(e),
            })
            errors++
          }
        })
      )
    )

    const verb = kind === 'pull' ? 'Pull' : 'Push'
    const parts = [`${done} ok`]
    if (errors > 0) {
      parts.push(`${errors} com erro`)
    }
    if (skipped > 0) {
      parts.push(`${skipped} sem upstream`)
    }

    this.setState({
      isRunning: false,
      notice: `${verb} em lote: ${parts.join(', ')}.`,
    })
  }

  private onPull = () => this.runBatch('pull')
  private onPush = () => this.runBatch('push')

  private onShowReport = () => this.setState({ showReport: true })
  private onCloseReport = () => this.setState({ showReport: false })

  /** Repos grouped by what they need, for the status report. */
  private getStatusSections(
    rows: ReadonlyArray<IDashboardRow>
  ): ReadonlyArray<{ readonly title: string; readonly items: ReadonlyArray<string> }> {
    const label = (row: IDashboardRow, detail?: string) =>
      detail ? `${row.repository.name} — ${detail}` : row.repository.name

    const needCommit = rows.filter(r => r.changedFilesCount > 0)
    const behind = rows.filter(r => (r.aheadBehind?.behind ?? 0) > 0)
    const ahead = rows.filter(r => (r.aheadBehind?.ahead ?? 0) > 0)
    const noUpstream = rows.filter(r => r.aheadBehind === null)
    const upToDate = rows.filter(
      r =>
        r.aheadBehind !== null &&
        r.changedFilesCount === 0 &&
        r.aheadBehind.ahead === 0 &&
        r.aheadBehind.behind === 0
    )

    return [
      {
        title: 'Para commitar',
        items: needCommit.map(r => label(r, `${r.changedFilesCount} arquivo(s)`)),
      },
      {
        title: 'Atrás do remoto (pull)',
        items: behind.map(r => label(r, `${r.aheadBehind?.behind} commit(s)`)),
      },
      {
        title: 'À frente (push)',
        items: ahead.map(r => label(r, `${r.aheadBehind?.ahead} commit(s)`)),
      },
      { title: 'Sem upstream', items: noUpstream.map(r => label(r)) },
      { title: 'Atualizados', items: upToDate.map(r => label(r)) },
    ]
  }

  /** Per-repo result of the last batch pull/push, for the status report. */
  private getOpsReport(
    rows: ReadonlyArray<IDashboardRow>
  ): { readonly verb: string; readonly lines: ReadonlyArray<string> } | null {
    const entries = Array.from(this.state.ops.entries())
    if (entries.length === 0) {
      return null
    }

    const nameById = new Map(rows.map(r => [r.repository.id, r.repository.name]))
    const verb = entries[0][1].kind === 'pull' ? 'Pull' : 'Push'

    const lines = entries.map(([id, op]) => {
      const name = nameById.get(id) ?? String(id)
      const status =
        op.status === 'done'
          ? 'ok'
          : op.status === 'running'
          ? 'em andamento'
          : `erro${op.message ? ` — ${op.message}` : ''}`
      return `${name}: ${status}`
    })

    return { verb, lines }
  }

  private buildReportText(rows: ReadonlyArray<IDashboardRow>): string {
    const lines = [`Relatório de status — ${rows.length} repositório(s)`, '']

    for (const section of this.getStatusSections(rows)) {
      if (section.items.length === 0) {
        continue
      }
      lines.push(`# ${section.title} (${section.items.length})`)
      section.items.forEach(item => lines.push(`- ${item}`))
      lines.push('')
    }

    const opsReport = this.getOpsReport(rows)
    if (opsReport !== null) {
      lines.push(
        `# Última ação em lote — ${opsReport.verb} (${opsReport.lines.length})`
      )
      opsReport.lines.forEach(item => lines.push(`- ${item}`))
      lines.push('')
    }

    return lines.join('\n').trim() + '\n'
  }

  private onCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(this.buildReportText(this.getRows()))
      this.setState({ reportCopied: true })
      window.setTimeout(() => this.setState({ reportCopied: false }), 2000)
    } catch (e) {
      log.error('[MultiRepoDashboard] failed to copy status report', e)
    }
  }

  private renderReport(rows: ReadonlyArray<IDashboardRow>) {
    const sections = this.getStatusSections(rows)
    const opsReport = this.getOpsReport(rows)

    return (
      <div className="multi-repo-status-report">
        <div className="report-toolbar">
          <Button onClick={this.onCloseReport}>
            <Octicon symbol={octicons.arrowLeft} />
            Voltar ao painel
          </Button>
          <Button onClick={this.onCopyReport}>
            <Octicon symbol={octicons.copy} />
            {this.state.reportCopied ? 'Copiado!' : 'Copiar relatório'}
          </Button>
        </div>

        <div className="report-body selectable-text">
          <p className="report-summary">
            {rows.length} repositório{rows.length === 1 ? '' : 's'} no total.
          </p>

          {sections.map(section =>
            section.items.length === 0 ? null : (
              <div className="report-section" key={section.title}>
                <h3>
                  {section.title} ({section.items.length})
                </h3>
                <ul>
                  {section.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )
          )}

          {opsReport !== null && (
            <div className="report-section last-op">
              <h3>
                Última ação em lote — {opsReport.verb} (
                {opsReport.lines.length})
              </h3>
              <ul>
                {opsReport.lines.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )
  }

  public render() {
    const rows = this.getRows()
    const withChanges = rows.filter(r => r.changedFilesCount > 0).length
    const behind = rows.filter(r => (r.aheadBehind?.behind ?? 0) > 0).length
    const ahead = rows.filter(r => (r.aheadBehind?.ahead ?? 0) > 0).length

    const { selectedRepoIds, isRunning } = this.state
    const selectedCount = selectedRepoIds.size
    const allSelected =
      rows.length > 0 && rows.every(r => selectedRepoIds.has(r.repository.id))
    const selectAllValue =
      selectedCount === 0
        ? CheckboxValue.Off
        : allSelected
        ? CheckboxValue.On
        : CheckboxValue.Mixed

    const actionDisabled = isRunning || selectedCount === 0
    const countLabel = selectedCount > 0 ? ` (${selectedCount})` : ''

    return (
      <UiView id="multi-repo-dashboard">
        <header className="multi-repo-dashboard-header">
          <div className="title-area">
            <h1>Painel de repositórios</h1>
            <div className="summary">
              {rows.length} repositório{rows.length === 1 ? '' : 's'} ·{' '}
              {withChanges} para commitar · {behind} atrás · {ahead} à frente
              {this.state.isRefreshing && (
                <span className="refreshing">
                  {' · '}
                  <Octicon className="spin" symbol={syncClockwise} /> atualizando
                  status…
                </span>
              )}
            </div>
          </div>
          <Button onClick={this.props.onClose}>Fechar</Button>
        </header>

        {this.state.showReport ? (
          this.renderReport(rows)
        ) : (
          <>
            {rows.length > 0 && (
              <div className="multi-repo-dashboard-toolbar">
                <Checkbox
                  className="select-all"
                  label="Selecionar todos"
                  value={selectAllValue}
                  onChange={this.onToggleSelectAll}
                  disabled={isRunning}
                />
                <div className="batch-actions">
                  <Button
                    onClick={this.onRefresh}
                    disabled={isRunning || this.state.isRefreshing}
                  >
                    <Octicon
                      className={this.state.isRefreshing ? 'spin' : undefined}
                      symbol={syncClockwise}
                    />
                    Atualizar
                  </Button>
                  <Button onClick={this.onPull} disabled={actionDisabled}>
                    <Octicon symbol={octicons.arrowDown} />
                    Pull{countLabel}
                  </Button>
                  <Button onClick={this.onPush} disabled={actionDisabled}>
                    <Octicon symbol={octicons.arrowUp} />
                    Push{countLabel}
                  </Button>
                  <Button onClick={this.onShowReport} disabled={isRunning}>
                    <Octicon symbol={octicons.listUnordered} />
                    Status
                  </Button>
                  {isRunning && (
                    <span className="batch-running">
                      <Octicon className="spin" symbol={syncClockwise} />
                      Processando…
                    </span>
                  )}
                  {!isRunning && this.state.notice && (
                    <span className="batch-notice">{this.state.notice}</span>
                  )}
                </div>
              </div>
            )}

            <div className="multi-repo-dashboard-list">
              {rows.length === 0 ? (
                <div className="empty-message">
                  Nenhum repositório adicionado.
                </div>
              ) : (
                rows.map(row => (
                  <MultiRepoDashboardRow
                    key={row.repository.id}
                    row={row}
                    selected={selectedRepoIds.has(row.repository.id)}
                    op={this.state.ops.get(row.repository.id)}
                    disabled={isRunning}
                    onToggleSelected={this.onToggleSelected}
                    onOpen={this.props.onSelectRepository}
                    autoPushEnabled={
                      getAutoPushPreferences(row.repository.workflowPreferences)
                        .enabled
                    }
                    onToggleAutoPush={this.onToggleAutoPush}
                  />
                ))
              )}
            </div>
          </>
        )}
      </UiView>
    )
  }
}
