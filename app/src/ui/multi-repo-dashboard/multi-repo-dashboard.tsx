import * as React from 'react'
import * as Path from 'path'
import pLimit from 'p-limit'

import { UiView } from '../ui-view'
import { Repository, ILocalRepositoryState } from '../../models/repository'
import { getAutoPushPreferences } from '../../models/workflow-preferences'
import { showOpenDialog } from '../main-process-proxy'
import { findGitRepositories } from '../../lib/find-git-repositories'
import { CloningRepository } from '../../models/cloning-repository'
import { IAheadBehind } from '../../models/branch'
import { FetchType } from '../../models/fetch'
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
          tooltip={op.message ? `${verb}: ${op.message}` : `${verb} concluído`}
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

  /** Mostra a sub-tela "Adicionar pasta" (escanear + selecionar) no lugar da lista. */
  readonly addFolderOpen: boolean

  /** Pasta raiz escolhida para o scan. */
  readonly addFolderRoot: string | null

  /** Está escaneando a pasta em busca de repos? */
  readonly addFolderScanning: boolean

  /** Caminhos de repos git encontrados no scan. */
  readonly addFolderFound: ReadonlyArray<string>

  /** Caminhos marcados para adicionar. */
  readonly addFolderSelected: ReadonlySet<string>

  /** Está adicionando os repos selecionados? */
  readonly addFolderAdding: boolean

  /** Chaves (pasta-mãe) dos grupos recolhidos. */
  readonly collapsedGroups: ReadonlySet<string>
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
      addFolderOpen: false,
      addFolderRoot: null,
      addFolderScanning: false,
      addFolderFound: [],
      addFolderSelected: new Set<string>(),
      addFolderAdding: false,
      collapsedGroups: new Set<string>(),
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

  /**
   * Group the rows by their parent folder so repos that live together under a
   * project folder (e.g. `~/x/BLUE3/*`, `~/x/DRIVE/*`) show together. The label
   * is the parent folder's name. Groups with pending work come first.
   */
  private getGroups(
    rows: ReadonlyArray<IDashboardRow>
  ): ReadonlyArray<{
    readonly key: string
    readonly label: string
    readonly rows: ReadonlyArray<IDashboardRow>
  }> {
    const map = new Map<string, IDashboardRow[]>()
    for (const row of rows) {
      const parent = Path.dirname(row.repository.path)
      const existing = map.get(parent)
      if (existing !== undefined) {
        existing.push(row)
      } else {
        map.set(parent, [row])
      }
    }

    const groups = Array.from(map, ([key, groupRows]) => ({
      key,
      label: Path.basename(key) || key,
      rows: groupRows as ReadonlyArray<IDashboardRow>,
    }))

    return groups.sort((a, b) => {
      const da = a.rows.some(hasDemand) ? 0 : 1
      const db = b.rows.some(hasDemand) ? 0 : 1
      return da !== db ? da - db : a.label.localeCompare(b.label)
    })
  }

  private onToggleGroup = (key: string) => {
    const next = new Set(this.state.collapsedGroups)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    this.setState({ collapsedGroups: next })
  }

  private onToggleAllGroups = () => {
    const groups = this.getGroups(this.getRows())
    const allCollapsed =
      groups.length > 0 &&
      groups.every(g => this.state.collapsedGroups.has(g.key))
    this.setState({
      collapsedGroups: allCollapsed
        ? new Set<string>()
        : new Set<string>(groups.map(g => g.key)),
    })
  }

  private renderRow = (row: IDashboardRow) => (
    <MultiRepoDashboardRow
      key={row.repository.id}
      row={row}
      selected={this.state.selectedRepoIds.has(row.repository.id)}
      op={this.state.ops.get(row.repository.id)}
      disabled={this.state.isRunning}
      onToggleSelected={this.onToggleSelected}
      onOpen={this.props.onSelectRepository}
      autoPushEnabled={
        getAutoPushPreferences(row.repository.workflowPreferences).enabled
      }
      onToggleAutoPush={this.onToggleAutoPush}
    />
  )

  private renderGroup = (group: {
    readonly key: string
    readonly label: string
    readonly rows: ReadonlyArray<IDashboardRow>
  }) => {
    const collapsed = this.state.collapsedGroups.has(group.key)
    const demand = group.rows.filter(hasDemand).length
    const selectedInGroup = group.rows.filter(r =>
      this.state.selectedRepoIds.has(r.repository.id)
    ).length
    const groupValue =
      selectedInGroup === 0
        ? CheckboxValue.Off
        : selectedInGroup === group.rows.length
        ? CheckboxValue.On
        : CheckboxValue.Mixed

    return (
      <div className="repo-group" key={group.key}>
        <div className="repo-group-header">
          <Checkbox
            className="group-select"
            value={groupValue}
            onChange={() => this.onToggleGroupSelection(group)}
            disabled={this.state.isRunning}
          />
          <button
            type="button"
            className="repo-group-toggle"
            onClick={() => this.onToggleGroup(group.key)}
            aria-expanded={!collapsed}
          >
            <Octicon
              symbol={collapsed ? octicons.chevronRight : octicons.chevronDown}
            />
            <Octicon className="group-icon" symbol={octicons.fileDirectory} />
            <span className="group-label">{group.label}</span>
            <span className="group-count">({group.rows.length})</span>
            {demand > 0 && (
              <span className="group-demand">{demand} com demanda</span>
            )}
          </button>
        </div>
        {!collapsed && group.rows.map(this.renderRow)}
      </div>
    )
  }

  private onToggleGroupSelection = (group: {
    readonly rows: ReadonlyArray<IDashboardRow>
  }) => {
    if (this.state.isRunning) {
      return
    }
    const ids = group.rows.map(r => r.repository.id)
    const allSelected = ids.every(id => this.state.selectedRepoIds.has(id))
    const next = new Set(this.state.selectedRepoIds)
    if (allSelected) {
      ids.forEach(id => next.delete(id))
    } else {
      ids.forEach(id => next.add(id))
    }
    this.setState({ selectedRepoIds: next })
  }

  /**
   * Liga/desliga o push automático nos repositórios selecionados de uma vez.
   * Liga sempre com auto-commit desligado (modo seguro) — assim, mesmo que um
   * repo de terceiro entre na seleção sem querer, ele no máximo tenta um push
   * (que falha sem permissão e é só logado), nunca cria commits nem força nada.
   */
  private onToggleAutoPushSelected = () => {
    if (this.state.isRunning) {
      return
    }
    const selected = this.getRows().filter(r =>
      this.state.selectedRepoIds.has(r.repository.id)
    )
    if (selected.length === 0) {
      return
    }

    const allOn = selected.every(
      r => getAutoPushPreferences(r.repository.workflowPreferences).enabled
    )
    const enable = !allOn

    for (const row of selected) {
      const current = getAutoPushPreferences(row.repository.workflowPreferences)
      if (current.enabled === enable) {
        continue
      }
      this.props.dispatcher
        .updateRepositoryWorkflowPreferences(row.repository, {
          ...row.repository.workflowPreferences,
          autoPush: { ...current, enabled: enable },
        })
        .catch(e =>
          log.error('[MultiRepoDashboard] batch auto-push toggle failed', e)
        )
    }

    this.setState({
      notice: `Push automático ${enable ? 'ligado' : 'desligado'} em ${
        selected.length
      } repo(s).`,
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

    if (selected.length === 0) {
      this.setState({ notice: 'Selecione ao menos um repositório.' })
      return
    }

    this.setState({ isRunning: true, ops: new Map(), notice: null })

    let done = 0
    let errors = 0
    let skipped = 0
    let noop = 0

    // Sync a few repositories at a time instead of one-by-one.
    const limit = pLimit(MaxConcurrentSyncs)

    await Promise.all(
      selected.map(row =>
        limit(async () => {
          const repo = row.repository
          this.setOp(repo.id, { kind, status: 'running' })

          try {
            // Refresh the repo's FULL state first. Without this the push/pull
            // run against an empty cache (tip = Unknown, no remote) and the git
            // operation silently no-ops — that was the "push fez nada" bug.
            await this.props.dispatcher.refreshRepository(repo)

            let before = this.props.localRepositoryStateLookup.get(repo.id)
            let ab = before?.aheadBehind ?? null

            // No tracked upstream → nothing to pull/push in batch.
            if (ab === null) {
              this.setOp(repo.id, {
                kind,
                status: 'done',
                message: 'sem upstream',
              })
              skipped++
              return
            }

            if (kind === 'push') {
              if (ab.ahead === 0) {
                this.setOp(repo.id, {
                  kind,
                  status: 'done',
                  message: 'nada a enviar',
                })
                noop++
                return
              }
              await this.props.dispatcher.push(repo)
              await this.props.dispatcher.refreshRepositoryIndicator(repo)
              this.setOp(repo.id, {
                kind,
                status: 'done',
                message: `${ab.ahead} commit(s) enviado(s)`,
              })
              done++
            } else {
              // Pull needs a real fetch first. The `behind` count from local
              // `git status` is measured against the last-fetched remote-
              // tracking ref, so a repo that truly has upstream commits reports
              // behind === 0 and gets wrongly skipped as "já atualizado" — the
              // bug where a manual `git pull` (git_pull.sh) pulled material the
              // dashboard had missed. Fetch, re-read the real ahead/behind,
              // then decide.
              await this.props.dispatcher.fetch(
                repo,
                FetchType.UserInitiatedTask
              )
              await this.props.dispatcher.refreshRepository(repo)
              before = this.props.localRepositoryStateLookup.get(repo.id)
              ab = before?.aheadBehind ?? ab

              if (ab.behind === 0) {
                this.setOp(repo.id, {
                  kind,
                  status: 'done',
                  message: 'já atualizado',
                })
                noop++
                return
              }
              await this.props.dispatcher.pull(repo)
              await this.props.dispatcher.refreshRepositoryIndicator(repo)
              this.setOp(repo.id, {
                kind,
                status: 'done',
                message: `${ab.behind} commit(s) recebido(s)`,
              })
              done++
            }
          } catch (e) {
            // Also surface the failure in the app log (e.g.
            // ~/.config/GitHub Desktop[-dev]/logs) so batch errors are
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
    const parts = [`${done} feito(s)`]
    if (noop > 0) {
      parts.push(`${noop} sem mudança`)
    }
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

  private onAddFolder = async () => {
    const root = await showOpenDialog({ properties: ['openDirectory'] })

    if (root === null) {
      return
    }

    this.setState({
      addFolderOpen: true,
      addFolderRoot: root,
      addFolderScanning: true,
      addFolderFound: [],
      addFolderSelected: new Set<string>(),
    })

    try {
      const found = await findGitRepositories(root)
      const tracked = new Set(this.props.repositories.map(r => r.path))
      // Pre-select everything that isn't already tracked by the app.
      const selected = new Set(found.filter(p => !tracked.has(p)))
      this.setState({
        addFolderFound: found,
        addFolderSelected: selected,
        addFolderScanning: false,
      })
    } catch (e) {
      log.error('[MultiRepoDashboard] folder scan failed', e)
      this.setState({
        addFolderScanning: false,
        notice: 'Falha ao escanear a pasta.',
      })
    }
  }

  private onCancelAddFolder = () =>
    this.setState({
      addFolderOpen: false,
      addFolderFound: [],
      addFolderSelected: new Set<string>(),
    })

  private getSelectableFoundPaths(): ReadonlyArray<string> {
    const tracked = new Set(this.props.repositories.map(r => r.path))
    return this.state.addFolderFound.filter(p => !tracked.has(p))
  }

  private onToggleFoundPath = (path: string) => {
    const next = new Set(this.state.addFolderSelected)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    this.setState({ addFolderSelected: next })
  }

  private onToggleSelectAllFound = () => {
    const selectable = this.getSelectableFoundPaths()
    const allSelected =
      selectable.length > 0 &&
      selectable.every(p => this.state.addFolderSelected.has(p))
    this.setState({
      addFolderSelected: allSelected
        ? new Set<string>()
        : new Set<string>(selectable),
    })
  }

  private onConfirmAddFolder = async () => {
    const paths = Array.from(this.state.addFolderSelected)
    if (paths.length === 0) {
      return
    }

    this.setState({ addFolderAdding: true })
    try {
      await this.props.dispatcher.addRepositories(paths)
      this.setState({
        addFolderOpen: false,
        addFolderAdding: false,
        addFolderFound: [],
        addFolderSelected: new Set<string>(),
        notice: `${paths.length} repositório(s) adicionado(s).`,
      })
      // Compute indicators for the freshly added repositories.
      this.refreshAllIndicators()
    } catch (e) {
      log.error('[MultiRepoDashboard] failed to add repositories', e)
      this.setState({
        addFolderAdding: false,
        notice: 'Falha ao adicionar repositórios.',
      })
    }
  }

  private renderAddFolder() {
    const tracked = new Set(this.props.repositories.map(r => r.path))
    const found = this.state.addFolderFound
    const selectable = this.getSelectableFoundPaths()
    const selectedCount = this.state.addFolderSelected.size
    const allSelected =
      selectable.length > 0 &&
      selectable.every(p => this.state.addFolderSelected.has(p))
    const selectAllValue =
      selectedCount === 0
        ? CheckboxValue.Off
        : allSelected
        ? CheckboxValue.On
        : CheckboxValue.Mixed

    return (
      <div className="multi-repo-status-report">
        <div className="report-toolbar">
          <Button
            onClick={this.onCancelAddFolder}
            disabled={this.state.addFolderAdding}
          >
            <Octicon symbol={octicons.arrowLeft} />
            Voltar
          </Button>
          {!this.state.addFolderScanning && selectable.length > 0 && (
            <Checkbox
              className="select-all"
              label="Selecionar todos"
              value={selectAllValue}
              onChange={this.onToggleSelectAllFound}
            />
          )}
          <Button
            onClick={this.onConfirmAddFolder}
            disabled={this.state.addFolderAdding || selectedCount === 0}
          >
            <Octicon symbol={octicons.check} />
            Adicionar ({selectedCount})
          </Button>
        </div>

        <div className="report-body">
          <p className="report-summary">{this.state.addFolderRoot}</p>

          {this.state.addFolderScanning ? (
            <p className="report-summary">
              <Octicon className="spin" symbol={syncClockwise} /> Escaneando…
            </p>
          ) : found.length === 0 ? (
            <div className="empty-message">
              Nenhum repositório git encontrado nessa pasta.
            </div>
          ) : (
            <div className="add-folder-list">
              {found.map(p => {
                const isTracked = tracked.has(p)
                const checked =
                  isTracked || this.state.addFolderSelected.has(p)
                return (
                  <div className="found-repo" key={p}>
                    <Checkbox
                      value={checked ? CheckboxValue.On : CheckboxValue.Off}
                      onChange={() => this.onToggleFoundPath(p)}
                      disabled={isTracked || this.state.addFolderAdding}
                    />
                    <span className="found-path">{p}</span>
                    {isTracked && (
                      <span className="found-tag">já adicionado</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

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
          ? op.message ?? 'ok'
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

    const groups = this.getGroups(rows)
    const allGroupsCollapsed =
      groups.length > 0 &&
      groups.every(g => this.state.collapsedGroups.has(g.key))

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

    const selectedRows = rows.filter(r => selectedRepoIds.has(r.repository.id))
    const selectedAllAutoPush =
      selectedRows.length > 0 &&
      selectedRows.every(
        r => getAutoPushPreferences(r.repository.workflowPreferences).enabled
      )

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
          <div className="header-actions">
            {!this.state.addFolderOpen && !this.state.showReport && (
              <Button onClick={this.onAddFolder}>Adicionar pasta…</Button>
            )}
            <Button onClick={this.props.onClose}>Fechar</Button>
          </div>
        </header>

        {this.state.addFolderOpen ? (
          this.renderAddFolder()
        ) : this.state.showReport ? (
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
                  <Button onClick={this.onToggleAllGroups} disabled={isRunning}>
                    <Octicon
                      symbol={allGroupsCollapsed ? octicons.unfold : octicons.fold}
                    />
                    {allGroupsCollapsed ? 'Expandir todos' : 'Colapsar todos'}
                  </Button>
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
                  <Button
                    onClick={this.onToggleAutoPushSelected}
                    disabled={actionDisabled}
                  >
                    <Octicon symbol={syncClockwise} />
                    {selectedAllAutoPush
                      ? 'Desligar auto-push'
                      : 'Ligar auto-push'}
                    {countLabel}
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
                groups.map(this.renderGroup)
              )}
            </div>
          </>
        )}
      </UiView>
    )
  }
}
