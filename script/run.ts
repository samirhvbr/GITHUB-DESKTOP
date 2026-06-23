import { join } from 'path'
import { spawn, SpawnOptions } from 'child_process'
import * as Fs from 'fs'
import { getDistPath, getExecutableName } from './dist-info'

const distPath = getDistPath()
const productName = getExecutableName()

let binaryPath = ''
if (process.platform === 'darwin') {
  binaryPath = join(
    distPath,
    `${productName}.app`,
    'Contents',
    'MacOS',
    `${productName}`
  )
} else if (process.platform === 'win32') {
  binaryPath = join(distPath, `${productName}.exe`)
} else if (process.platform === 'linux') {
  binaryPath = join(distPath, productName)
} else {
  console.error(`I dunno how to run on ${process.platform} ${process.arch} :(`)
  process.exit(1)
}

export function run(spawnOptions: SpawnOptions) {
  try {
    // eslint-disable-next-line no-sync
    const stats = Fs.statSync(binaryPath)
    if (!stats.isFile()) {
      return null
    }
  } catch (e) {
    return null
  }

  const opts = Object.assign({}, spawnOptions)

  opts.env = Object.assign(opts.env || {}, process.env, {
    NODE_ENV: 'development',
  })

  // The surrounding shell may have ELECTRON_RUN_AS_NODE set (some tooling sets
  // it). If it leaks into the launched binary, Electron runs as plain Node, the
  // `app` module is undefined and the main process exits immediately with no
  // window. Strip it so the dev build always boots as a real Electron app.
  delete opts.env.ELECTRON_RUN_AS_NODE

  return spawn(binaryPath, [], opts)
}
