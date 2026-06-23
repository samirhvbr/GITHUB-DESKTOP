import * as React from 'react'

import { UiView } from '../ui-view'
import { Repository, ILocalRepositoryState } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { IAheadBehind } from '../../models/branch'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Button } from '../lib/button'
import { TooltippedContent } from '../lib/tooltipped-content'

interface IDashboardRow {
  readonly repository: Repository
  readonly changedFilesCount: number
  readonly aheadBehind: IAheadBehind | null
}

function hasDemand(row: IDashboardRow): boolean {
  return row.changedFilesCount > 0 || (row.aheadBehind?.behind ?? 0) > 0
}

interface IMultiRepoDashboardRowProps {
  readonly row: IDashboardRow
  readonly onSelect: (repository: Repository) => void
}

class MultiRepoDashboardRow extends React.Component<IMultiRepoDashboardRowProps> {
  private onClick = () => {
    this.props.onSelect(this.props.row.repository)
  }

  public render() {
    const { repository, changedFilesCount, aheadBehind } = this.props.row
    const ahead = aheadBehind?.ahead ?? 0
    const behind = aheadBehind?.behind ?? 0
    const hasChanges = changedFilesCount > 0
    const isClean = !hasChanges && ahead === 0 && behind === 0

    return (
      <button type="button" className="repo-row" onClick={this.onClick}>
        <Octicon className="repo-icon" symbol={octicons.repo} />
        <span className="repo-name">{repository.name}</span>

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
      </button>
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

  /** Chamado quando o usuário escolhe um repositório para abrir. */
  readonly onSelectRepository: (repository: Repository) => void

  /** Chamado para fechar o painel e voltar ao repositório selecionado. */
  readonly onClose: () => void
}

/**
 * Painel agregado que lista todos os repositórios de uma vez, destacando os que
 * têm demanda: alterações pendentes de commit ou commits atrás do remoto (pull).
 */
export class MultiRepoDashboard extends React.Component<IMultiRepoDashboardProps> {
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

  public render() {
    const rows = this.getRows()
    const withChanges = rows.filter(r => r.changedFilesCount > 0).length
    const behind = rows.filter(r => (r.aheadBehind?.behind ?? 0) > 0).length

    return (
      <UiView id="multi-repo-dashboard">
        <header className="multi-repo-dashboard-header">
          <div className="title-area">
            <h1>Painel de repositórios</h1>
            <div className="summary">
              {rows.length} repositório{rows.length === 1 ? '' : 's'} ·{' '}
              {withChanges} com alterações · {behind} atrás do remoto
            </div>
          </div>
          <Button onClick={this.props.onClose}>Fechar</Button>
        </header>

        <div className="multi-repo-dashboard-list">
          {rows.length === 0 ? (
            <div className="empty-message">Nenhum repositório adicionado.</div>
          ) : (
            rows.map(row => (
              <MultiRepoDashboardRow
                key={row.repository.id}
                row={row}
                onSelect={this.props.onSelectRepository}
              />
            ))
          )}
        </div>
      </UiView>
    )
  }
}
