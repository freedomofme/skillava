import { useState, useCallback } from 'react'
import { ConfigPaths } from '../types'
import { parseClaudeStateMcp } from './parsers'

const STORAGE_KEY = 'skillava-project-folders'

export function loadSavedFolders(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveFolders(folders: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(folders))
}

export async function discoverAllProjectPaths(
  userFolders: string[],
  configPaths: ConfigPaths,
): Promise<string[]> {
  const allPaths = new Set<string>(userFolders)
  const stateContent = await window.electronAPI.readFile(configPaths.claude.state)
  if (stateContent) {
    for (const g of parseClaudeStateMcp(stateContent)) {
      if (g.scope === 'project' && g.projectPath) {
        allPaths.add(g.projectPath)
      }
    }
  }
  return Array.from(allPaths)
}

export function useProjectFolders(configPaths: ConfigPaths) {
  // Local state drives re-renders on this page; localStorage is source of truth across pages
  const [revision, setRevision] = useState(0)

  const discoverPaths = useCallback(async () => {
    // Always read fresh from localStorage so cross-page changes are picked up
    return discoverAllProjectPaths(loadSavedFolders(), configPaths)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, configPaths])

  async function addFolder(): Promise<string | null> {
    const selected = await window.electronAPI.selectFolder()
    if (!selected) return null
    const current = loadSavedFolders()
    if (current.includes(selected)) return null
    saveFolders([...current, selected])
    setRevision((r) => r + 1)
    return selected
  }

  function removeFolder(dir: string) {
    saveFolders(loadSavedFolders().filter((f) => f !== dir))
    setRevision((r) => r + 1)
  }

  function isUserAdded(dir: string) {
    return loadSavedFolders().includes(dir)
  }

  return { discoverPaths, addFolder, removeFolder, isUserAdded }
}

export const TOOL_COLORS: Record<string, string> = {
  'Claude Code': '#f59e0b',
  'Codex': '#10b981',
  'Cursor': '#6366f1',
}

export const TOOL_BADGE: Record<string, string> = {
  'Claude Code': 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'Codex': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'Cursor': 'bg-violet-500/15 text-violet-300',
}

export const SOURCE_BADGE: Record<string, string> = {
  'Claude Code': 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  '.mcp.json': 'bg-indigo-500/15 text-indigo-300',
  'Cursor': 'bg-violet-500/15 text-violet-300',
}
