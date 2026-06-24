import * as React from 'react'
import * as Path from 'path'
import { Dispatcher } from '../dispatcher'
import { addSafeDirectory, getRepositoryType } from '../../lib/git'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { LinkButton } from '../lib/link-button'
import { PopupType } from '../../models/popup'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { FoldoutType } from '../../lib/app-state'

import untildify from 'untildify'
import { showOpenDialog } from '../main-process-proxy'
import { Ref } from '../lib/ref'
import { InputError } from '../lib/input-description/input-error'
import { IAccessibleMessage } from '../../models/accessible-message'
import { findGitRepositories } from '../../lib/find-git-repositories'

interface IAddExistingRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void

  /** An optional path to prefill the path text box with.
   * Defaults to the empty string if not defined.
   */
  readonly path?: string
}

interface IAddExistingRepositoryState {
  readonly path: string

  /**
   * Indicates whether or not to render a warning message about the entered path
   * not containing a valid Git repository. This value differs from `isGitRepository` in that it holds
   * its value when the path changes until we've gotten a definitive answer from the asynchronous
   * method that the path is, or isn't, a valid repository path. Separating the two means that
   * we don't toggle visibility of the warning message until it's really necessary, preventing
   * flickering for our users as they type in a path.
   */
  readonly showNonGitRepositoryWarning: boolean
  readonly isRepositoryBare: boolean
  readonly isRepositoryUnsafe: boolean
  readonly repositoryUnsafePath?: string
  readonly isTrustingRepository: boolean

  /**
   * Fork feature: when the chosen path isn't itself a repository, we scan it for
   * git repositories nested inside (e.g. a work folder like `~/x` holding many
   * repos) so the user can add them all from this same dialog.
   */
  readonly scanning: boolean
  readonly foundRepos: ReadonlyArray<string>
  readonly selectedFound: ReadonlySet<string>
}

/** The component for adding an existing local repository. */
export class AddExistingRepository extends React.Component<
  IAddExistingRepositoryProps,
  IAddExistingRepositoryState
> {
  private pathTextBoxRef = React.createRef<TextBox>()

  /** Debounce handle for scanning a typed path for nested repositories. */
  private inspectTimer: number | null = null

  public constructor(props: IAddExistingRepositoryProps) {
    super(props)

    const path = this.props.path ? this.props.path : ''

    this.state = {
      path,
      showNonGitRepositoryWarning: false,
      isRepositoryBare: false,
      isRepositoryUnsafe: false,
      isTrustingRepository: false,
      scanning: false,
      foundRepos: [],
      selectedFound: new Set<string>(),
    }
  }

  public componentWillUnmount() {
    if (this.inspectTimer !== null) {
      window.clearTimeout(this.inspectTimer)
    }
  }

  private onTrustDirectory = async () => {
    this.setState({ isTrustingRepository: true })
    const { repositoryUnsafePath, path } = this.state
    if (repositoryUnsafePath) {
      await addSafeDirectory(repositoryUnsafePath)
    }
    await this.validatePath(path)
    this.setState({ isTrustingRepository: false })
  }

  private async validatePath(path: string): Promise<boolean> {
    if (path.length === 0) {
      this.setState({
        isRepositoryBare: false,
        showNonGitRepositoryWarning: false,
      })
      return false
    }

    const type = await getRepositoryType(path)

    const isRepository = type.kind !== 'missing' && type.kind !== 'unsafe'
    const isRepositoryUnsafe = type.kind === 'unsafe'
    const isRepositoryBare = type.kind === 'bare'
    const showNonGitRepositoryWarning = !isRepository || isRepositoryBare
    const repositoryUnsafePath = type.kind === 'unsafe' ? type.path : undefined

    this.setState(state =>
      path === state.path
        ? {
            isRepositoryBare,
            isRepositoryUnsafe,
            showNonGitRepositoryWarning,
            repositoryUnsafePath,
          }
        : null
    )

    return path.length > 0 && isRepository && !isRepositoryBare
  }

  /**
   * Fork feature: inspect a path. If it's a single repository we keep the
   * normal single-add behavior; otherwise we scan it for repositories nested
   * inside and, if any are found, offer to add them all.
   */
  private inspectPath = async (rawPath: string) => {
    if (rawPath.length === 0) {
      this.setState({
        scanning: false,
        foundRepos: [],
        selectedFound: new Set<string>(),
        showNonGitRepositoryWarning: false,
      })
      return
    }

    const isValid = await this.validatePath(rawPath)
    if (isValid) {
      // It's a single repository — no folder scan needed.
      this.setState({ foundRepos: [], selectedFound: new Set<string>() })
      return
    }

    // Only scan when the path simply isn't a repository (not bare/unsafe).
    const type = await getRepositoryType(rawPath)
    if (type.kind !== 'missing') {
      this.setState({ foundRepos: [], selectedFound: new Set<string>() })
      return
    }

    this.setState({ scanning: true })
    try {
      await this.scanForRepositories(rawPath)
    } catch (e) {
      log.error('[AddExistingRepository] folder scan failed', e)
      this.setState({ scanning: false })
    }
  }

  private async scanForRepositories(
    rawPath: string
  ): Promise<ReadonlyArray<string>> {
    const found = await findGitRepositories(this.resolvedPath(rawPath))
    // Pre-select everything found by default.
    this.setState(state =>
      rawPath === state.path
        ? {
            foundRepos: found,
            selectedFound: new Set<string>(found),
            scanning: false,
          }
        : null
    )
    return found
  }

  private buildBareRepositoryError() {
    if (
      !this.state.path.length ||
      !this.state.showNonGitRepositoryWarning ||
      !this.state.isRepositoryBare
    ) {
      return null
    }

    const msg =
      'This directory appears to be a bare repository. Bare repositories are not currently supported.'

    return { screenReaderMessage: msg, displayedMessage: msg }
  }

  private buildRepositoryUnsafeError() {
    const { repositoryUnsafePath, path } = this.state
    if (
      !this.state.path.length ||
      !this.state.showNonGitRepositoryWarning ||
      !this.state.isRepositoryUnsafe ||
      repositoryUnsafePath === undefined
    ) {
      return null
    }

    // Git for Windows will replace backslashes with slashes in the error
    // message so we'll do the same to not show "the repo at path c:/repo"
    // when the entered path is `c:\repo`.
    const convertedPath = __WIN32__ ? path.replaceAll('\\', '/') : path

    const displayedMessage = (
      <>
        <p>
          The Git repository
          {repositoryUnsafePath !== convertedPath && (
            <>
              {' at '}
              <Ref>{repositoryUnsafePath}</Ref>
            </>
          )}{' '}
          appears to be owned by another user on your machine. Adding untrusted
          repositories may automatically execute files in the repository.
        </p>
        <p>
          If you trust the owner of the directory you can
          <LinkButton onClick={this.onTrustDirectory}>
            {' '}
            add an exception for this directory
          </LinkButton>{' '}
          in order to continue.
        </p>
      </>
    )

    const screenReaderMessage = `The Git repository appears to be owned by another user on your machine.
      Adding untrusted repositories may automatically execute files in the repository.
      If you trust the owner of the directory you can add an exception for this directory in order to continue.`

    return { screenReaderMessage, displayedMessage }
  }

  private buildNotAGitRepositoryError(): IAccessibleMessage | null {
    if (!this.state.path.length || !this.state.showNonGitRepositoryWarning) {
      return null
    }

    // If we're scanning or already found repos inside the folder, show that
    // flow instead of the "not a git repository" warning.
    if (this.state.scanning || this.state.foundRepos.length > 0) {
      return null
    }

    const displayedMessage = (
      <>
        <p>This directory does not appear to be a Git repository.</p>
        <p>
          Would you like to{' '}
          <LinkButton onClick={this.onCreateRepositoryClicked}>
            create a repository
          </LinkButton>{' '}
          here instead?
        </p>
      </>
    )

    const screenReaderMessage =
      'This directory does not appear to be a Git repository. Would you like to create a repository here instead?'

    return { screenReaderMessage, displayedMessage }
  }

  private renderErrors() {
    const msg: IAccessibleMessage | null =
      this.buildBareRepositoryError() ??
      this.buildRepositoryUnsafeError() ??
      this.buildNotAGitRepositoryError()

    if (msg === null) {
      return null
    }

    return (
      <Row>
        <InputError
          id="add-existing-repository-path-error"
          ariaLiveMessage={msg.screenReaderMessage}
        >
          {msg.displayedMessage}
        </InputError>
      </Row>
    )
  }

  /**
   * Fork feature: render the list of git repositories found inside the chosen
   * folder, with checkboxes so the user picks which ones to add.
   */
  private renderFoundRepositories() {
    if (this.state.scanning) {
      return (
        <Row>
          <div className="add-existing-scanning">
            Procurando repositórios git nesta pasta…
          </div>
        </Row>
      )
    }

    const found = this.state.foundRepos
    if (found.length === 0) {
      return null
    }

    const selectedCount = this.state.selectedFound.size
    const allSelected = found.every(p => this.state.selectedFound.has(p))
    const selectAllValue =
      selectedCount === 0
        ? CheckboxValue.Off
        : allSelected
        ? CheckboxValue.On
        : CheckboxValue.Mixed

    return (
      <div className="add-existing-found">
        <Row>
          <Checkbox
            label={`${found.length} repositório(s) encontrado(s) nesta pasta`}
            value={selectAllValue}
            onChange={this.onToggleAllFound}
          />
        </Row>
        <div className="add-existing-found-list">
          {found.map(p => (
            <div className="found-repo" key={p}>
              <Checkbox
                value={
                  this.state.selectedFound.has(p)
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
                onChange={() => this.onToggleFound(p)}
              />
              <span className="found-name">{Path.basename(p)}</span>
              <span className="found-path">{p}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  private onToggleFound = (path: string) => {
    const next = new Set(this.state.selectedFound)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    this.setState({ selectedFound: next })
  }

  private onToggleAllFound = () => {
    const allSelected = this.state.foundRepos.every(p =>
      this.state.selectedFound.has(p)
    )
    this.setState({
      selectedFound: allSelected
        ? new Set<string>()
        : new Set<string>(this.state.foundRepos),
    })
  }

  public render() {
    const inFolderMode = this.state.foundRepos.length > 0
    const okButtonText = inFolderMode
      ? `Adicionar ${this.state.selectedFound.size} repositório(s)`
      : __DARWIN__
      ? 'Add Repository'
      : 'Add repository'

    return (
      <Dialog
        id="add-existing-repository"
        title={__DARWIN__ ? 'Add Local Repository' : 'Add local repository'}
        onSubmit={this.addRepository}
        onDismissed={this.props.onDismissed}
        loading={this.state.isTrustingRepository}
      >
        <DialogContent>
          <Row>
            <TextBox
              ref={this.pathTextBoxRef}
              value={this.state.path}
              label={__DARWIN__ ? 'Local Path' : 'Local path'}
              placeholder="repository path"
              onValueChanged={this.onPathChanged}
              ariaDescribedBy="add-existing-repository-path-error"
            />
            <Button onClick={this.showFilePicker}>Choose…</Button>
          </Row>
          {this.renderErrors()}
          {this.renderFoundRepositories()}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={okButtonText}
            okButtonDisabled={inFolderMode && this.state.selectedFound.size === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onPathChanged = async (path: string) => {
    if (this.state.path !== path) {
      this.setState({
        path,
        foundRepos: [],
        selectedFound: new Set<string>(),
      })

      // Debounce the (potentially expensive) repository type check + folder
      // scan while the user is still typing.
      if (this.inspectTimer !== null) {
        window.clearTimeout(this.inspectTimer)
      }
      this.inspectTimer = window.setTimeout(() => this.inspectPath(path), 500)
    }
  }

  private showFilePicker = async () => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (path === null) {
      return
    }

    this.setState({
      path,
      foundRepos: [],
      selectedFound: new Set<string>(),
    })
    this.inspectPath(path)
  }

  private resolvedPath(path: string): string {
    return Path.resolve('/', untildify(path))
  }

  private addRepository = async () => {
    // Folder-of-repositories mode: add every selected repo found by the scan.
    if (this.state.foundRepos.length > 0) {
      const paths = Array.from(this.state.selectedFound)
      if (paths.length === 0) {
        return
      }
      await this.addPaths(paths)
      return
    }

    const { path } = this.state
    const isValidPath = await this.validatePath(path)

    if (isValidPath) {
      await this.addPaths([this.resolvedPath(path)])
      return
    }

    // Not a single repository — try scanning it for repositories inside before
    // giving up. If we find some, show the list and let the user confirm.
    const type = await getRepositoryType(path)
    if (type.kind === 'missing') {
      this.setState({ scanning: true })
      try {
        const found = await this.scanForRepositories(path)
        if (found.length > 0) {
          return
        }
      } catch (e) {
        log.error('[AddExistingRepository] folder scan failed', e)
        this.setState({ scanning: false })
      }
    }

    this.pathTextBoxRef.current?.focus()
  }

  private async addPaths(paths: ReadonlyArray<string>) {
    this.props.onDismissed()
    const { dispatcher } = this.props

    const repositories = await dispatcher.addRepositories(paths)

    if (repositories.length > 0) {
      dispatcher.closeFoldout(FoldoutType.Repository)
      dispatcher.selectRepository(repositories[0])
      dispatcher.recordAddExistingRepository()
    }
  }

  private onCreateRepositoryClicked = () => {
    this.props.onDismissed()

    const resolvedPath = this.resolvedPath(this.state.path)

    return this.props.dispatcher.showPopup({
      type: PopupType.CreateRepository,
      path: resolvedPath,
    })
  }
}
