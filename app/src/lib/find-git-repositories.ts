import { readdir } from 'fs/promises'
import * as Path from 'path'
import { pathExists } from './path-exists'

/** Directories that are never worth descending into when scanning for repos. */
const IgnoredDirectories = new Set([
  'node_modules',
  'vendor',
  'dist',
  'out',
  'build',
  '.cache',
  '.git',
])

/** Safety cap so a scan of a huge tree can't run away. */
const MaxResults = 500

/**
 * Recursively scan a folder for git repositories.
 *
 * Fork feature (multi-repo dashboard — "Adicionar pasta"). Walks `root` and
 * returns the path of every directory that contains a `.git` entry. It does NOT
 * descend into a directory once it's recognized as a repository, so submodules
 * and nested working trees aren't reported as separate top-level repositories.
 * Hidden directories and common build/dependency folders are skipped.
 *
 * @param root      The folder to scan.
 * @param maxDepth  How many levels below `root` to descend (default 4). This
 *                  covers container layouts like `~/x/DRIVE/<repo>` without
 *                  walking the entire disk.
 */
export async function findGitRepositories(
  root: string,
  maxDepth = 4
): Promise<ReadonlyArray<string>> {
  const found = new Array<string>()

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (found.length >= MaxResults) {
      return
    }

    // A directory that contains `.git` (folder, file for worktrees/submodules)
    // is a repository — record it and stop descending.
    if (await pathExists(Path.join(dir, '.git'))) {
      found.push(dir)
      return
    }

    if (depth >= maxDepth) {
      return
    }

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      // Unreadable directory (permissions, race) — just skip it.
      return
    }

    const subdirs = entries.filter(
      e =>
        e.isDirectory() &&
        !e.name.startsWith('.') &&
        !IgnoredDirectories.has(e.name)
    )

    for (const entry of subdirs) {
      await walk(Path.join(dir, entry.name), depth + 1)
    }
  }

  await walk(root, 0)

  return found.sort((a, b) => a.localeCompare(b))
}
