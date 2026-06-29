/* eslint-disable no-sync */

import * as cp from 'child_process'
import * as path from 'path'
import * as electronInstaller from 'electron-winstaller'
import { getProductName, getCompanyName } from '../app/package-info'
import {
  getDistPath,
  getExecutableName,
  getOSXZipPath,
  getWindowsIdentifierName,
  getWindowsStandaloneName,
  getWindowsInstallerName,
  shouldMakeDelta,
  getUpdatesURL,
  isPublishable,
  getBundleSizes,
  getDistRoot,
  getDistArchitecture,
  getIconDirectory,
} from './dist-info'
import { isGitHubActions } from './build-platforms'
import {
  existsSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  readdirSync,
  statSync,
} from 'fs'
import { getVersion } from '../app/package-info'
import { rename } from 'fs/promises'
import { join } from 'path'
import { assertNonNullable } from '../app/src/lib/fatal-error'

const distPath = getDistPath()
const productName = getProductName()
const outputDir = getDistRoot()

const assertExistsSync = (path: string) => {
  if (!existsSync(path)) {
    throw new Error(`Expected ${path} to exist`)
  }
}

if (process.platform === 'darwin') {
  packageOSX()
} else if (process.platform === 'win32') {
  packageWindows()
} else if (process.platform === 'linux') {
  packageLinux()
} else {
  console.error(`I don't know how to package for ${process.platform} :(`)
  process.exit(1)
}

console.log('Writing bundle size info…')
writeFileSync(
  path.join(getDistRoot(), 'bundle-size.json'),
  JSON.stringify(getBundleSizes())
)

function packageOSX() {
  const dest = getOSXZipPath()
  rmSync(dest, { recursive: true, force: true })

  console.log('Packaging for macOS…')
  cp.execSync(
    `ditto -ck --keepParent "${distPath}/${productName}.app" "${dest}"`
  )
}

function packageWindows() {
  const iconSource = join(getIconDirectory(), 'icon-logo.ico')

  if (!existsSync(iconSource)) {
    console.error(`expected setup icon not found at location: ${iconSource}`)
    process.exit(1)
  }

  const splashScreenPath = path.resolve(
    __dirname,
    '../app/static/logos/win32-installer-splash.gif'
  )

  if (!existsSync(splashScreenPath)) {
    console.error(
      `expected setup splash screen gif not found at location: ${splashScreenPath}`
    )
    process.exit(1)
  }

  const iconUrl = 'https://desktop.githubusercontent.com/app-icon.ico'

  const nugetPkgName = getWindowsIdentifierName()
  const options: electronInstaller.Options = {
    name: nugetPkgName,
    appDirectory: distPath,
    outputDirectory: outputDir,
    authors: getCompanyName(),
    iconUrl: iconUrl,
    setupIcon: iconSource,
    loadingGif: splashScreenPath,
    exe: `${nugetPkgName}.exe`,
    title: productName,
    setupExe: getWindowsStandaloneName(),
    setupMsi: getWindowsInstallerName(),
  }

  if (shouldMakeDelta()) {
    const url = new URL(getUpdatesURL())
    // Make sure Squirrel.Windows isn't affected by partially or completely
    // disabled releases.
    url.searchParams.set('bypassStaggeredRelease', '1')
    options.remoteReleases = url.toString()
  }

  if (isGitHubActions() && isPublishable()) {
    assertNonNullable(process.env.RUNNER_TEMP, 'Missing RUNNER_TEMP env var')

    const acsPath = join(process.env.RUNNER_TEMP, 'acs')
    const dlibPath = join(acsPath, 'bin', 'x64', 'Azure.CodeSigning.Dlib.dll')

    assertExistsSync(dlibPath)

    const metadataPath = join(acsPath, 'metadata.json')
    const acsMetadata = {
      Endpoint: 'https://wus3.codesigning.azure.net/',
      CodeSigningAccountName: 'GitHubInc',
      CertificateProfileName: 'GitHubInc',
      CorrelationId: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }
    writeFileSync(metadataPath, JSON.stringify(acsMetadata))

    options.signWithParams = `/v /fd SHA256 /tr "http://timestamp.acs.microsoft.com" /td SHA256 /dlib "${dlibPath}" /dmdf "${metadataPath}"`
  }

  console.log('Packaging for Windows…')
  electronInstaller
    .createWindowsInstaller(options)
    .then(() => console.log(`Installers created in ${outputDir}`))
    .then(async () => {
      // electron-winstaller (more specifically Squirrel.Windows) doesn't let
      // us control the name of the nuget packages but we want them to include
      // the architecture similar to how the setup exe and msi do so we'll just
      // have to rename them here after the fact.
      const arch = getDistArchitecture()
      const prefix = `${getWindowsIdentifierName()}-${getVersion()}`

      for (const kind of shouldMakeDelta() ? ['full', 'delta'] : ['full']) {
        const from = join(outputDir, `${prefix}-${kind}.nupkg`)
        const to = join(outputDir, `${prefix}-${arch}-${kind}.nupkg`)

        console.log(`Renaming ${from} to ${to}`)
        await rename(from, to)
      }
    })
    .catch(e => {
      console.error(`Error packaging: ${e}`)
      process.exit(1)
    })
}

function packageLinux() {
  runLinuxPackaging().catch(e => {
    console.error(`Error packaging: ${describeError(e)}`)
    process.exit(1)
  })
}

/**
 * Build every Linux artifact we know how to produce (.deb, .rpm, AppImage) in a
 * best-effort fashion: each format is attempted independently, a missing system
 * tool only skips that one format, and we only fail the whole step if nothing
 * could be produced at all. (Each format has to be built on a Linux host —
 * Electron can't cross-build.)
 */
async function runLinuxPackaging() {
  const icon = resolveLinuxIcon()

  // Which formats to build, overridable via LINUX_FORMATS (comma-separated,
  // e.g. `LINUX_FORMATS=rpm`). Defaults to all. This lets the Fedora/RHEL
  // container in build-rpm-docker.sh build only the .rpm.
  const requested = (process.env.LINUX_FORMATS ?? 'deb,rpm,appimage')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0)

  const formats: ReadonlyArray<{
    readonly key: string
    readonly name: string
    readonly build: (icon: string | null) => Promise<string>
  }> = [
    { key: 'deb', name: '.deb', build: buildDeb },
    { key: 'rpm', name: '.rpm', build: buildRpm },
    { key: 'appimage', name: 'AppImage', build: buildAppImage },
  ].filter(f => requested.includes(f.key))

  if (formats.length === 0) {
    throw new Error(
      `LINUX_FORMATS não casa com nenhum formato conhecido: "${process.env.LINUX_FORMATS}"`
    )
  }

  const made: string[] = []
  const skipped: string[] = []

  for (const { name, build } of formats) {
    try {
      made.push(await build(icon))
    } catch (e) {
      skipped.push(`${name}: ${describeError(e)}`)
    }
  }

  console.log('\nLinux packaging summary:')
  made.forEach(m => console.log(`  ✓ ${m}`))
  skipped.forEach(s => console.warn(`  ✗ ${s}`))

  if (made.length === 0) {
    throw new Error('No Linux packages were produced')
  }
}

/** Debian package (.deb) via electron-installer-debian. Needs dpkg + fakeroot. */
async function buildDeb(icon: string | null): Promise<string> {
  // Pull the packager in lazily with require() (not import) so the
  // type-check/build on Windows and macOS — where it isn't installed — doesn't
  // try to resolve it. On Linux `yarn` installs it and it shells out to dpkg.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const installDebian = require('electron-installer-debian')

  // Debian names the architecture 'amd64'/'arm64'.
  const arch = getDistArchitecture() === 'arm64' ? 'arm64' : 'amd64'

  console.log('Packaging for Linux (.deb)…')
  await installDebian({
    src: distPath, // dist/desktop-linux-<arch>
    dest: outputDir, // dist/
    arch,
    bin: getExecutableName(), // 'desktop'
    name: 'github-desktop',
    productName,
    genericName: productName,
    section: 'devel',
    categories: ['GNOME', 'GTK', 'Development', 'RevisionControl'],
    ...(icon ? { icon } : {}),
  })

  return `.deb (${arch}) em ${outputDir}`
}

/** Red Hat package (.rpm) via electron-installer-redhat. Needs rpmbuild. */
async function buildRpm(icon: string | null): Promise<string> {
  if (!commandExists('rpmbuild')) {
    throw new Error(
      'rpmbuild não encontrado — instale com `sudo apt install rpm`'
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const installRedhat = require('electron-installer-redhat')

  // RPM names the architecture 'x86_64'/'aarch64'.
  const arch = getDistArchitecture() === 'arm64' ? 'aarch64' : 'x86_64'

  console.log('Packaging for Linux (.rpm)…')
  try {
    await installRedhat({
      src: distPath,
      dest: outputDir,
      arch,
      bin: getExecutableName(),
      name: 'github-desktop',
      productName,
      genericName: productName,
      license: 'MIT',
      categories: ['GNOME', 'GTK', 'Development', 'RevisionControl'],
      ...(icon ? { icon } : {}),
    })
  } catch (e) {
    // electron-installer-redhat 3.4.0 is unmaintained and breaks on RPM 4.20+
    // (which runs %install in a per-package build subdir the generated spec
    // doesn't account for). Keep the skip message short and actionable: the
    // AppImage already covers RPM-based distros, and a native .rpm can be built
    // in a Fedora/RHEL environment (e.g. a container) where the toolchain matches.
    const detail = e instanceof Error ? e.message.split('\n')[0] : String(e)
    throw new Error(
      'rpmbuild falhou neste host. A lib electron-installer-redhat (3.4.0) não é ' +
        'compatível com RPM 4.20+. O AppImage já roda em distros RPM; para um .rpm ' +
        `nativo, gere num ambiente Fedora/RHEL (ex.: container). Detalhe: ${detail}`
    )
  }

  return `.rpm (${arch}) em ${outputDir}`
}

/**
 * Portable AppImage. We assemble a minimal AppDir (the whole built app + an
 * AppRun launcher, .desktop entry and icon) and hand it to `appimagetool`,
 * which is downloaded on first use if it isn't already on the PATH.
 */
async function buildAppImage(icon: string | null): Promise<string> {
  if (icon === null) {
    throw new Error('precisa de um ícone PNG (nenhum pôde ser obtido)')
  }

  const tool = ensureAppImageTool()
  const arch = getDistArchitecture() === 'arm64' ? 'aarch64' : 'x86_64'
  const appId = 'github-desktop'
  const bin = getExecutableName()
  const appDir = join(getDistRoot(), `${appId}.AppDir`)

  console.log('Packaging for Linux (AppImage)…')
  rmSync(appDir, { recursive: true, force: true })
  mkdirSync(appDir, { recursive: true })

  // Bundle the entire built app into the AppDir.
  cp.execSync(`cp -a "${distPath}/." "${appDir}/"`)

  // appimagetool needs an icon named to match the .desktop's Icon= field, plus
  // a top-level .DirIcon.
  cp.execSync(`cp "${icon}" "${join(appDir, `${appId}.png`)}"`)
  cp.execSync(`cp "${icon}" "${join(appDir, '.DirIcon')}"`)

  writeFileSync(
    join(appDir, `${appId}.desktop`),
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${productName}`,
      `Exec=${bin}`,
      `Icon=${appId}`,
      'Categories=Development;RevisionControl;',
      'Terminal=false',
      '',
    ].join('\n')
  )

  const appRun = join(appDir, 'AppRun')
  writeFileSync(
    appRun,
    [
      '#!/bin/bash',
      'HERE="$(dirname "$(readlink -f "$0")")"',
      `exec "$HERE/${bin}" "$@"`,
      '',
    ].join('\n')
  )
  chmodSync(appRun, 0o755)

  const outFile = join(outputDir, `${appId}-${getVersion()}-${arch}.AppImage`)
  rmSync(outFile, { force: true })

  // APPIMAGE_EXTRACT_AND_RUN lets appimagetool (itself an AppImage) run without
  // relying on FUSE; ARCH tells it which architecture it's building for.
  cp.execSync(`"${tool}" "${appDir}" "${outFile}"`, {
    stdio: 'inherit',
    env: { ...process.env, ARCH: arch, APPIMAGE_EXTRACT_AND_RUN: '1' },
  })

  return `AppImage (${arch}) → ${outFile}`
}

/**
 * Resolve a usable `appimagetool`, downloading the official release into
 * dist/.tools on first use if it isn't already on the PATH.
 */
function ensureAppImageTool(): string {
  if (commandExists('appimagetool')) {
    return 'appimagetool'
  }

  const arch = getDistArchitecture() === 'arm64' ? 'aarch64' : 'x86_64'
  const toolDir = join(getDistRoot(), '.tools')
  mkdirSync(toolDir, { recursive: true })

  const toolPath = join(toolDir, `appimagetool-${arch}.AppImage`)
  if (!existsSync(toolPath)) {
    const url = `https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-${arch}.AppImage`
    console.log(`  Baixando appimagetool (${arch})…`)
    cp.execSync(`curl -fsSL -o "${toolPath}" "${url}"`, { stdio: 'inherit' })
    chmodSync(toolPath, 0o755)
  }

  return toolPath
}

/**
 * The Linux packagers all want a PNG icon, but the repo only ships .ico/.icns.
 * Use a committed PNG if present; otherwise derive one from the .ico with
 * ImageMagick (picking the largest embedded frame). Returns null if no icon can
 * be produced — packages then build without a custom icon (AppImage is skipped).
 */
function resolveLinuxIcon(): string | null {
  const dir = getIconDirectory()

  const png = join(dir, 'icon-logo.png')
  if (existsSync(png)) {
    return png
  }

  const ico = join(dir, 'icon-logo.ico')
  const tool = commandExists('magick')
    ? 'magick'
    : commandExists('convert')
    ? 'convert'
    : null

  if (!existsSync(ico) || tool === null) {
    console.warn(
      'Sem PNG e sem ImageMagick para derivar do .ico — pacotes sairão sem ' +
        'ícone customizado (e o AppImage será pulado).'
    )
    return null
  }

  try {
    const work = join(getDistRoot(), '.icon')
    rmSync(work, { recursive: true, force: true })
    mkdirSync(work, { recursive: true })

    // An .ico holds several frames; emit them all, then keep the biggest one.
    cp.execSync(`${tool} "${ico}" "${join(work, 'frame.png')}"`, {
      stdio: 'ignore',
    })

    const frames = readdirSync(work).filter(f => f.endsWith('.png'))
    if (frames.length === 0) {
      return null
    }

    let best = frames[0]
    let bestSize = -1
    for (const f of frames) {
      const size = statSync(join(work, f)).size
      if (size > bestSize) {
        bestSize = size
        best = f
      }
    }

    // Normalize to 256x256 so every packager is happy.
    const out = join(work, 'icon-logo.png')
    cp.execSync(`${tool} "${join(work, best)}" -resize 256x256 "${out}"`, {
      stdio: 'ignore',
    })

    return out
  } catch (e) {
    console.warn(
      `Falha ao derivar PNG do .ico: ${describeError(e)}. Seguindo sem ícone.`
    )
    return null
  }
}

/** True if `cmd` is runnable on the current PATH. */
function commandExists(cmd: string): boolean {
  try {
    cp.execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
