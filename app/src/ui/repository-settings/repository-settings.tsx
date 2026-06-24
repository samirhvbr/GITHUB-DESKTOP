import * as React from 'react'
import { TabBar, TabBarType } from '../tab-bar'
import { Remote } from './remote'
import { GitIgnore } from './git-ignore'
import { assertNever } from '../../lib/fatal-error'
import { IRemote } from '../../models/remote'
import { Dispatcher } from '../dispatcher'
import { PopupType } from '../../models/popup'
import {
  Repository,
  getForkContributionTarget,
  isRepositoryWithForkedGitHubRepository,
} from '../../models/repository'
import { Dialog, DialogError, DialogFooter } from '../dialog'
import { NoRemote } from './no-remote'
import { readGitIgnoreAtRoot } from '../../lib/git'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { ForkSettings } from './fork-settings'
import { AutoPushSettings } from './auto-push-settings'
import {
  ForkContributionTarget,
  WorkflowPreferences,
  AutoPushPreferences,
  getAutoPushPreferences,
  MinAutoPushIntervalMinutes,
  DefaultAutoPushIntervalMinutes,
} from '../../models/workflow-preferences'
import { GitConfigLocation, GitConfig } from './git-config'
import {
  getConfigValue,
  getGlobalConfigValue,
  removeConfigValue,
  setConfigValue,
} from '../../lib/git/config'
import {
  gitAuthorNameIsValid,
  InvalidGitAuthorNameMessage,
} from '../lib/identifier-rules'
import { Account } from '../../models/account'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IRepositorySettingsProps {
  readonly initialSelectedTab?: RepositorySettingsTab
  readonly dispatcher: Dispatcher
  readonly remote: IRemote | null
  readonly repository: Repository
  readonly repositoryAccount: Account | null
  readonly onDismissed: () => void
}

export enum RepositorySettingsTab {
  Remote = 0,
  IgnoredFiles,
  GitConfig,
  AutoPush,
  ForkSettings,
}

interface IRepositorySettingsState {
  readonly selectedTab: RepositorySettingsTab
  readonly remote: IRemote | null
  readonly ignoreText: string | null
  readonly ignoreTextHasChanged: boolean
  readonly disabled: boolean
  readonly saveDisabled: boolean
  readonly gitConfigLocation: GitConfigLocation
  readonly committerName: string
  readonly committerEmail: string
  readonly globalCommitterName: string
  readonly globalCommitterEmail: string
  readonly initialGitConfigLocation: GitConfigLocation
  readonly initialCommitterName: string | null
  readonly initialCommitterEmail: string | null
  readonly errors?: ReadonlyArray<JSX.Element | string>
  readonly forkContributionTarget: ForkContributionTarget
  readonly isLoadingGitConfig: boolean
  readonly autoPushEnabled: boolean
  readonly autoPushIntervalText: string
  readonly autoPushAutoCommit: boolean
  readonly autoPushCommitMessage: string
}

export class RepositorySettings extends React.Component<
  IRepositorySettingsProps,
  IRepositorySettingsState
> {
  public constructor(props: IRepositorySettingsProps) {
    super(props)

    const autoPush = getAutoPushPreferences(props.repository.workflowPreferences)
    log.info(
      `[WFP] open ${props.repository.name} (id=${
        props.repository.id
      }) wfp=${JSON.stringify(props.repository.workflowPreferences)}`
    )

    this.state = {
      selectedTab:
        this.props.initialSelectedTab || RepositorySettingsTab.Remote,
      remote: props.remote,
      ignoreText: null,
      ignoreTextHasChanged: false,
      disabled: false,
      forkContributionTarget: getForkContributionTarget(props.repository),
      saveDisabled: false,
      gitConfigLocation: GitConfigLocation.Global,
      committerName: '',
      committerEmail: '',
      globalCommitterName: '',
      globalCommitterEmail: '',
      initialGitConfigLocation: GitConfigLocation.Global,
      initialCommitterName: null,
      initialCommitterEmail: null,
      isLoadingGitConfig: true,
      autoPushEnabled: autoPush.enabled,
      autoPushIntervalText: String(autoPush.intervalMinutes),
      autoPushAutoCommit: autoPush.autoCommit,
      autoPushCommitMessage: autoPush.commitMessage ?? '',
    }
  }

  public async componentWillMount() {
    try {
      const ignoreText = await readGitIgnoreAtRoot(this.props.repository)
      this.setState({ ignoreText })
    } catch (e) {
      log.error(
        `RepositorySettings: unable to read root .gitignore file for ${this.props.repository.path}`,
        e
      )
      this.setState({ errors: [`Could not read root .gitignore: ${e}`] })
    }

    const localCommitterName = await getConfigValue(
      this.props.repository,
      'user.name',
      true
    )
    const localCommitterEmail = await getConfigValue(
      this.props.repository,
      'user.email',
      true
    )

    const globalCommitterName = (await getGlobalConfigValue('user.name')) || ''
    const globalCommitterEmail =
      (await getGlobalConfigValue('user.email')) || ''

    const gitConfigLocation =
      localCommitterName === null && localCommitterEmail === null
        ? GitConfigLocation.Global
        : GitConfigLocation.Local

    let committerName = globalCommitterName
    let committerEmail = globalCommitterEmail

    if (gitConfigLocation === GitConfigLocation.Local) {
      committerName = localCommitterName ?? ''
      committerEmail = localCommitterEmail ?? ''
    }

    this.setState({
      gitConfigLocation,
      committerName,
      committerEmail,
      globalCommitterName,
      globalCommitterEmail,
      initialGitConfigLocation: gitConfigLocation,
      initialCommitterName: localCommitterName,
      initialCommitterEmail: localCommitterEmail,
      isLoadingGitConfig: false,
    })
  }

  private renderErrors(): JSX.Element[] | null {
    const errors = this.state.errors

    if (!errors || !errors.length) {
      return null
    }

    return errors.map((err, ix) => {
      const key = `err-${ix}`
      return <DialogError key={key}>{err}</DialogError>
    })
  }

  public render() {
    const showForkSettings = isRepositoryWithForkedGitHubRepository(
      this.props.repository
    )

    return (
      <Dialog
        id="repository-settings"
        title={__DARWIN__ ? 'Repository Settings' : 'Repository settings'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        disabled={this.state.disabled}
      >
        {this.renderErrors()}

        <div className="tab-container">
          <TabBar
            onTabClicked={this.onTabClicked}
            selectedIndex={this.state.selectedTab}
            type={TabBarType.Vertical}
          >
            <span>
              <Octicon className="icon" symbol={octicons.server} />
              Remote
            </span>
            <span>
              <Octicon className="icon" symbol={octicons.file} />
              {__DARWIN__ ? 'Ignored Files' : 'Ignored files'}
            </span>
            <span>
              <Octicon className="icon" symbol={octicons.gitCommit} />
              {__DARWIN__ ? 'Git Config' : 'Git config'}
            </span>
            <span>
              <Octicon className="icon" symbol={octicons.arrowUp} />
              Push automático
            </span>
            {showForkSettings && (
              <span>
                <Octicon className="icon" symbol={octicons.repoForked} />
                {__DARWIN__ ? 'Fork Behavior' : 'Fork behavior'}
              </span>
            )}
          </TabBar>

          <div className="active-tab">{this.renderActiveTab()}</div>
        </div>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Save"
            okButtonDisabled={this.state.saveDisabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderActiveTab() {
    const tab = this.state.selectedTab
    switch (tab) {
      case RepositorySettingsTab.Remote: {
        const remote = this.state.remote
        if (remote) {
          return (
            <Remote
              remote={remote}
              onRemoteUrlChanged={this.onRemoteUrlChanged}
            />
          )
        } else {
          return <NoRemote onPublish={this.onPublish} />
        }
      }
      case RepositorySettingsTab.IgnoredFiles: {
        return (
          <GitIgnore
            text={this.state.ignoreText}
            onIgnoreTextChanged={this.onIgnoreTextChanged}
            onShowExamples={this.onShowGitIgnoreExamples}
          />
        )
      }
      case RepositorySettingsTab.AutoPush: {
        return (
          <AutoPushSettings
            enabled={this.state.autoPushEnabled}
            intervalText={this.state.autoPushIntervalText}
            autoCommit={this.state.autoPushAutoCommit}
            commitMessage={this.state.autoPushCommitMessage}
            onEnabledChanged={this.onAutoPushEnabledChanged}
            onIntervalTextChanged={this.onAutoPushIntervalTextChanged}
            onAutoCommitChanged={this.onAutoPushAutoCommitChanged}
            onCommitMessageChanged={this.onAutoPushCommitMessageChanged}
            onTestNow={this.onTestAutoPushNow}
          />
        )
      }

      case RepositorySettingsTab.ForkSettings: {
        if (!isRepositoryWithForkedGitHubRepository(this.props.repository)) {
          return null
        }

        return (
          <ForkSettings
            forkContributionTarget={this.state.forkContributionTarget}
            repository={this.props.repository}
            onForkContributionTargetChanged={
              this.onForkContributionTargetChanged
            }
          />
        )
      }

      case RepositorySettingsTab.GitConfig: {
        return (
          <GitConfig
            account={this.props.repositoryAccount}
            gitConfigLocation={this.state.gitConfigLocation}
            onGitConfigLocationChanged={this.onGitConfigLocationChanged}
            name={this.state.committerName}
            email={this.state.committerEmail}
            globalName={this.state.globalCommitterName}
            globalEmail={this.state.globalCommitterEmail}
            onNameChanged={this.onCommitterNameChanged}
            onEmailChanged={this.onCommitterEmailChanged}
            isLoadingGitConfig={this.state.isLoadingGitConfig}
          />
        )
      }

      default:
        return assertNever(tab, `Unknown tab type: ${tab}`)
    }
  }

  private onPublish = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.PublishRepository,
      repository: this.props.repository,
    })
  }

  private onShowGitIgnoreExamples = () => {
    this.props.dispatcher.openInBrowser('https://git-scm.com/docs/gitignore')
  }

  private onSubmit = async () => {
    this.setState({ disabled: true, errors: undefined })
    const errors = new Array<JSX.Element | string>()

    if (this.state.remote && this.props.remote) {
      const trimmedUrl = this.state.remote.url.trim()

      if (trimmedUrl !== this.props.remote.url) {
        try {
          await this.props.dispatcher.setRemoteURL(
            this.props.repository,
            this.props.remote.name,
            trimmedUrl
          )
        } catch (e) {
          log.error(
            `RepositorySettings: unable to set remote URL at ${this.props.repository.path}`,
            e
          )
          errors.push(`Failed setting the remote URL: ${e}`)
        }
      }
    }

    if (this.state.ignoreTextHasChanged && this.state.ignoreText !== null) {
      try {
        await this.props.dispatcher.saveGitIgnore(
          this.props.repository,
          this.state.ignoreText
        )
      } catch (e) {
        log.error(
          `RepositorySettings: unable to save gitignore at ${this.props.repository.path}`,
          e
        )
        errors.push(`Failed saving the .gitignore file: ${e}`)
      }
    }

    // Persist workflow preferences (fork contribution target + scheduled push)
    // in a single update so the two don't clobber each other.
    const existingPrefs = this.props.repository.workflowPreferences
    const newAutoPush = this.getAutoPushPreferencesFromState()
    const currentAutoPush = getAutoPushPreferences(existingPrefs)
    const forkTargetChanged =
      this.state.forkContributionTarget !== existingPrefs.forkContributionTarget
    const autoPushChanged =
      newAutoPush.enabled !== currentAutoPush.enabled ||
      newAutoPush.intervalMinutes !== currentAutoPush.intervalMinutes ||
      newAutoPush.autoCommit !== currentAutoPush.autoCommit ||
      (newAutoPush.commitMessage ?? '') !== (currentAutoPush.commitMessage ?? '')

    log.info(
      `[WFP] submit ${this.props.repository.name} new=${JSON.stringify(
        newAutoPush
      )} changed=${autoPushChanged}`
    )

    if (forkTargetChanged || autoPushChanged) {
      const newPreferences: WorkflowPreferences = {
        ...existingPrefs,
        autoPush: newAutoPush,
        ...(forkTargetChanged
          ? { forkContributionTarget: this.state.forkContributionTarget }
          : {}),
      }
      await this.props.dispatcher.updateRepositoryWorkflowPreferences(
        this.props.repository,
        newPreferences
      )
    }

    let shouldRefreshAuthor = false
    const gitLocationChanged =
      this.state.gitConfigLocation !== this.state.initialGitConfigLocation

    if (
      gitLocationChanged &&
      this.state.gitConfigLocation === GitConfigLocation.Global
    ) {
      // If it's now configured to use the global config, just delete the local
      // user info in this repository.
      await removeConfigValue(this.props.repository, 'user.name')
      await removeConfigValue(this.props.repository, 'user.email')

      shouldRefreshAuthor = true
    } else if (this.state.gitConfigLocation === GitConfigLocation.Local) {
      // Otherwise, update the local name and email if needed
      if (this.state.committerName !== this.state.initialCommitterName) {
        await setConfigValue(
          this.props.repository,
          'user.name',
          this.state.committerName
        )
        shouldRefreshAuthor = true
      }

      if (this.state.committerEmail !== this.state.initialCommitterEmail) {
        await setConfigValue(
          this.props.repository,
          'user.email',
          this.state.committerEmail
        )
        shouldRefreshAuthor = true
      }
    }

    if (shouldRefreshAuthor) {
      this.props.dispatcher.refreshAuthor(this.props.repository)
    }

    if (!errors.length) {
      this.props.onDismissed()
    } else {
      this.setState({ disabled: false, errors })
    }
  }

  private onRemoteUrlChanged = (url: string) => {
    const remote = this.props.remote

    if (!remote) {
      return
    }

    const newRemote = { ...remote, url }
    this.setState({ remote: newRemote })
  }

  private onIgnoreTextChanged = (text: string) => {
    this.setState({ ignoreText: text, ignoreTextHasChanged: true })
  }

  private onTabClicked = (index: number) => {
    this.setState({ selectedTab: index })
  }

  private onForkContributionTargetChanged = (
    forkContributionTarget: ForkContributionTarget
  ) => {
    this.setState({
      forkContributionTarget,
    })
  }

  private onGitConfigLocationChanged = (value: GitConfigLocation) => {
    this.setState({ gitConfigLocation: value })
  }

  private onCommitterNameChanged = (committerName: string) => {
    const errors = new Array<JSX.Element | string>()

    if (gitAuthorNameIsValid(committerName)) {
      this.setState({ saveDisabled: false })
    } else {
      this.setState({ saveDisabled: true })
      errors.push(InvalidGitAuthorNameMessage)
    }

    this.setState({ committerName, errors })
  }

  private onCommitterEmailChanged = (committerEmail: string) => {
    this.setState({ committerEmail })
  }

  private onAutoPushEnabledChanged = (autoPushEnabled: boolean) => {
    this.setState({ autoPushEnabled })
  }

  private onAutoPushIntervalTextChanged = (autoPushIntervalText: string) => {
    this.setState({ autoPushIntervalText })
  }

  private onAutoPushAutoCommitChanged = (autoPushAutoCommit: boolean) => {
    this.setState({ autoPushAutoCommit })
  }

  private onAutoPushCommitMessageChanged = (autoPushCommitMessage: string) => {
    this.setState({ autoPushCommitMessage })
  }

  private onTestAutoPushNow = () => {
    const prefs = this.getAutoPushPreferencesFromState()
    return this.props.dispatcher.runScheduledPushNow(
      this.props.repository,
      prefs.autoCommit,
      prefs.commitMessage
    )
  }

  /** Build the auto-push preferences from the dialog state (parse + clamp). */
  private getAutoPushPreferencesFromState(): AutoPushPreferences {
    const parsed = parseInt(this.state.autoPushIntervalText, 10)
    const intervalMinutes = Math.max(
      MinAutoPushIntervalMinutes,
      Number.isNaN(parsed) ? DefaultAutoPushIntervalMinutes : parsed
    )
    const commitMessage = this.state.autoPushCommitMessage.trim()

    return {
      enabled: this.state.autoPushEnabled,
      intervalMinutes,
      autoCommit: this.state.autoPushAutoCommit,
      commitMessage: commitMessage.length > 0 ? commitMessage : undefined,
    }
  }
}
