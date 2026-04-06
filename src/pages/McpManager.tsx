import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useI18n, type TransKey } from '../lib/i18n'
import {
  Plus, Trash2, Edit3, Save, X, Server, Globe, Terminal,
  FolderOpen, ChevronDown, ChevronRight, Folder, FolderPlus,
  FileJson, AlertCircle, Zap, Loader2, CheckCircle2, XCircle, Download, Copy,
} from 'lucide-react'
import { ConfigPaths, McpServer, McpGroup, McpTestResult } from '../types'
import {
  parseCodexMcpServers,
  updateCodexMcpServers,
  parseGeminiMcpServers,
  updateGeminiMcpServers,
  parseClaudeStateMcp,
  updateClaudeStateMcpGlobal,
  updateClaudeStateProjectMcp,
} from '../lib/parsers'
import { parseMcpImportInput, prepareImportedServers } from '../lib/mcpImport'
import { useProjectFolders, loadSavedFolders, SOURCE_BADGE } from '../lib/projectFolders'
import { useToast } from '../lib/toast'
import { loadSettings } from '../lib/settings'

interface McpManagerProps {
  configPaths: ConfigPaths | null
}

type ToolTab = 'codex' | 'claude' | 'cursor' | 'gemini' | 'projects'

const TOOL_TABS: { id: ToolTab; label: string; color: string }[] = [
  { id: 'codex', label: 'Codex', color: '#10b981' },
  { id: 'claude', label: 'Claude Code', color: '#f59e0b' },
  { id: 'cursor', label: 'Cursor', color: '#6366f1' },
  { id: 'gemini', label: 'Gemini CLI', color: '#4285f4' },
  { id: 'projects', label: 'Projects', color: '#a855f7' },
]

// ── Editing types ──

interface EditingServer {
  name: string
  type: 'url' | 'command'
  transport: 'stdio' | 'http' | 'sse'
  url: string
  command: string
  args: string
  env: string
  headers: string
}

function emptyEdit(): EditingServer {
  return { name: '', type: 'command', transport: 'stdio', url: '', command: '', args: '', env: '', headers: '' }
}

function stringifyKeyValueLines(
  value: Record<string, string> | undefined,
  separator: '=' | ':',
): string {
  if (!value) return ''
  return Object.entries(value)
    .map(([key, item]) => separator === ':' ? `${key}: ${item}` : `${key}=${item}`)
    .join('\n')
}

function parseKeyValueLines(value: string, separator: '=' | ':'): Record<string, string> | undefined {
  if (!value.trim()) return undefined
  const record: Record<string, string> = {}

  value.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    const primaryIndex = trimmed.indexOf(separator)
    const fallbackSeparator = separator === ':' ? '=' : ':'
    const fallbackIndex = primaryIndex < 0 ? trimmed.indexOf(fallbackSeparator) : -1
    const splitIndex = primaryIndex >= 0 ? primaryIndex : fallbackIndex
    if (splitIndex <= 0) return

    const key = trimmed.slice(0, splitIndex).trim()
    const rawValue = trimmed.slice(splitIndex + 1).trim()
    const normalizedValue = separator === ':' && rawValue.startsWith(':')
      ? rawValue.slice(1).trim()
      : rawValue
    if (key && normalizedValue) record[key] = normalizedValue
  })

  return Object.keys(record).length ? record : undefined
}

function serverToEdit(s: McpServer): EditingServer {
  return {
    name: s.name,
    type: s.url ? 'url' : 'command',
    transport: s.url ? (s.type === 'sse' ? 'sse' : 'http') : 'stdio',
    url: s.url || '',
    command: s.command || '',
    args: (s.args || []).join('\n'),
    env: stringifyKeyValueLines(s.env, '='),
    headers: stringifyKeyValueLines(s.headers, ':'),
  }
}

function editToServer(e: EditingServer): McpServer {
  const server: McpServer = { name: e.name }
  if (e.type === 'url') {
    server.url = e.url
    server.type = e.transport
  } else {
    server.command = e.command
    server.type = 'stdio'
    const args = e.args.split('\n').map((a) => a.trim()).filter(Boolean)
    if (args.length) server.args = args
  }
  server.env = parseKeyValueLines(e.env, '=')
  server.headers = parseKeyValueLines(e.headers, ':')
  return server
}

// ── Parse .mcp.json ──

function parseMcpJson(content: string): McpServer[] {
  try {
    const parsed = JSON.parse(content)
    const mcpServers = parsed.mcpServers || {}
    return Object.entries(mcpServers).map(([name, config]: [string, any]) => ({
      name,
      command: config.command,
      args: config.args,
      url: config.url || config.serverUrl,
      type: config.type,
      env: config.env,
      headers: config.headers,
    }))
  } catch {
    return []
  }
}

function serializeMcpJson(servers: McpServer[]): string {
  const mcpServers: Record<string, any> = {}
  for (const s of servers) {
    const entry: any = {}
    if (s.type) entry.type = s.type
    if (s.url) entry.url = s.url
    if (s.command) entry.command = s.command
    if (s.args?.length) entry.args = s.args
    entry.env = s.env || {}
    if (s.headers && Object.keys(s.headers).length) entry.headers = s.headers
    mcpServers[s.name] = entry
  }
  return JSON.stringify({ mcpServers }, null, 2)
}

// ── Cross-tool MCP copy (append one server to another tool's config) ──

type McpCopyDestination = 'codex' | 'cursor' | 'gemini' | 'claude-global'

function cloneMcpServer(s: McpServer): McpServer {
  return {
    ...s,
    args: s.args ? [...s.args] : undefined,
    env: s.env ? { ...s.env } : undefined,
    headers: s.headers ? { ...s.headers } : undefined,
  }
}

async function appendMcpToCodex(configPaths: ConfigPaths, server: McpServer): Promise<void> {
  const raw = (await window.electronAPI.readFile(configPaths.codex.config)) ?? ''
  const existing = raw ? parseCodexMcpServers(raw) : []
  const prep = prepareImportedServers([cloneMcpServer(server)], existing.map((x) => x.name))
  const newContent = updateCodexMcpServers(raw, [...existing, ...prep.servers])
  const ok = await window.electronAPI.writeFile(configPaths.codex.config, newContent)
  if (!ok) throw new Error('write failed')
}

async function appendMcpToCursor(configPaths: ConfigPaths, server: McpServer): Promise<void> {
  const raw = await window.electronAPI.readFile(configPaths.cursor.mcp)
  const existing = raw ? parseMcpJson(raw) : []
  const prep = prepareImportedServers([cloneMcpServer(server)], existing.map((x) => x.name))
  const newContent = serializeMcpJson([...existing, ...prep.servers])
  const ok = await window.electronAPI.writeFile(configPaths.cursor.mcp, newContent)
  if (!ok) throw new Error('write failed')
}

async function appendMcpToGemini(configPaths: ConfigPaths, server: McpServer): Promise<void> {
  const raw = (await window.electronAPI.readFile(configPaths.gemini.settings)) ?? ''
  const existing = raw ? parseGeminiMcpServers(raw) : []
  const prep = prepareImportedServers([cloneMcpServer(server)], existing.map((x) => x.name))
  const newContent = updateGeminiMcpServers(raw, [...existing, ...prep.servers])
  const ok = await window.electronAPI.writeFile(configPaths.gemini.settings, newContent)
  if (!ok) throw new Error('write failed')
}

async function appendMcpToClaudeGlobal(configPaths: ConfigPaths, server: McpServer): Promise<void> {
  const raw = (await window.electronAPI.readFile(configPaths.claude.state)) ?? ''
  if (!raw.trim()) throw new Error('~/.claude.json missing or empty')
  const groups = parseClaudeStateMcp(raw)
  const globalGroup = groups.find((g) => g.scope === 'global')
  const existing = globalGroup?.servers ?? []
  const prep = prepareImportedServers([cloneMcpServer(server)], existing.map((x) => x.name))
  const newContent = updateClaudeStateMcpGlobal(raw, [...existing, ...prep.servers])
  const ok = await window.electronAPI.writeFile(configPaths.claude.state, newContent)
  if (!ok) throw new Error('write failed')
}

function makeMcpCopyTargets(
  configPaths: ConfigPaths,
  server: McpServer,
  exclude: Set<McpCopyDestination>,
  showToast: (type: 'success' | 'error', message: string) => void,
  t: (key: TransKey, vars?: Record<string, string>) => string,
): { label: string; onCopy: () => Promise<void> }[] {
  const targets: { label: string; onCopy: () => Promise<void> }[] = []
  const push = (dest: McpCopyDestination, i18nKey: TransKey, fn: () => Promise<void>) => {
    if (exclude.has(dest)) return
    targets.push({
      label: t(i18nKey),
      onCopy: async () => {
        try {
          await fn()
          showToast('success', t('mcp.copy_done', { name: server.name, target: t(i18nKey) }))
        } catch (err: any) {
          showToast('error', t('mcp.copy_failed', { error: err?.message || 'unknown' }))
        }
      },
    })
  }
  push('codex', 'mcp.copy_target.codex', () => appendMcpToCodex(configPaths, server))
  push('cursor', 'mcp.copy_target.cursor', () => appendMcpToCursor(configPaths, server))
  push('gemini', 'mcp.copy_target.gemini', () => appendMcpToGemini(configPaths, server))
  push('claude-global', 'mcp.copy_target.claude_global', () => appendMcpToClaudeGlobal(configPaths, server))
  return targets
}

// ── Codex MCP Sub-view ──

function CodexMcpView({ configPaths, autoTest }: { configPaths: ConfigPaths; autoTest?: boolean }) {
  const { t } = useI18n()
  const [servers, setServers] = useState<McpServer[]>([])
  const [rawContent, setRawContent] = useState('')
  const [editing, setEditing] = useState<EditingServer | null>(null)
  const [editingIndex, setEditingIndex] = useState(-1)
  const { showToast } = useToast()

  const load = useCallback(async () => {
    const content = await window.electronAPI.readFile(configPaths.codex.config)
    if (content) {
      setRawContent(content)
      setServers(parseCodexMcpServers(content))
    }
  }, [configPaths])

  useEffect(() => { load() }, [load])

  async function handleSave(newServers: McpServer[]) {
    try {
      const newContent = updateCodexMcpServers(rawContent, newServers)
      const ok = await window.electronAPI.writeFile(configPaths.codex.config, newContent)
      if (!ok) throw new Error('write returned false')
      setRawContent(newContent)
      setServers(newServers)
      showToast('success', t('toast.saved'))
    } catch (err: any) {
      showToast('error', t('toast.save_failed', { error: err?.message || 'unknown' }))
    }
  }

  return (
    <McpListSection
      title={t('mcp.codex_title')}
      subtitle="~/.codex/config.toml → [mcp_servers]"
      servers={servers}
      editing={editing}
      editingIndex={editingIndex}
      setEditing={setEditing}
      onEdit={(i) => { setEditingIndex(i); setEditing(serverToEdit(servers[i])) }}
      onAdd={() => { setEditingIndex(-1); setEditing(emptyEdit()) }}
      onCancelEdit={() => { setEditing(null); setEditingIndex(-1) }}
      onSaveEdit={(e) => {
        const server = editToServer(e)
        const newList = editingIndex >= 0
          ? servers.map((s, i) => i === editingIndex ? server : s)
          : [...servers, server]
        handleSave(newList)
        setEditing(null); setEditingIndex(-1)
      }}
      onDelete={(i) => handleSave(servers.filter((_, idx) => idx !== i))}
      onOpenFile={() => window.electronAPI.openInFinder(configPaths.codex.config)}
      onImport={(imported) => handleSave([...servers, ...imported])}
      copyTargetsForServer={(s) => makeMcpCopyTargets(configPaths, s, new Set<McpCopyDestination>(['codex']), showToast, t)}
      autoTest={autoTest}
    />
  )
}

// ── Cursor MCP Sub-view ──

function CursorMcpView({ configPaths, autoTest }: { configPaths: ConfigPaths; autoTest?: boolean }) {
  const { t } = useI18n()
  const [servers, setServers] = useState<McpServer[]>([])
  const [editing, setEditing] = useState<EditingServer | null>(null)
  const [editingIndex, setEditingIndex] = useState(-1)
  const [fileExists, setFileExists] = useState(false)
  const { showToast } = useToast()

  const load = useCallback(async () => {
    const content = await window.electronAPI.readFile(configPaths.cursor.mcp)
    if (content) {
      setServers(parseMcpJson(content))
      setFileExists(true)
    } else {
      setFileExists(false)
    }
  }, [configPaths])

  useEffect(() => { load() }, [load])

  async function handleSave(newServers: McpServer[]) {
    try {
      const newContent = serializeMcpJson(newServers)
      const ok = await window.electronAPI.writeFile(configPaths.cursor.mcp, newContent)
      if (!ok) throw new Error('write returned false')
      setServers(newServers)
      setFileExists(true)
      showToast('success', t('toast.saved'))
    } catch (err: any) {
      showToast('error', t('toast.save_failed', { error: err?.message || 'unknown' }))
    }
  }

  return (
    <McpListSection
      title={t('mcp.cursor_title')}
      subtitle={fileExists ? t('mcp.cursor_subtitle_exists') : t('mcp.cursor_subtitle_missing')}
      servers={servers}
      editing={editing}
      editingIndex={editingIndex}
      setEditing={setEditing}
      onEdit={(i) => { setEditingIndex(i); setEditing(serverToEdit(servers[i])) }}
      onAdd={() => { setEditingIndex(-1); setEditing(emptyEdit()) }}
      onCancelEdit={() => { setEditing(null); setEditingIndex(-1) }}
      onSaveEdit={(e) => {
        const server = editToServer(e)
        const newList = editingIndex >= 0
          ? servers.map((s, i) => i === editingIndex ? server : s)
          : [...servers, server]
        handleSave(newList)
        setEditing(null); setEditingIndex(-1)
      }}
      onDelete={(i) => handleSave(servers.filter((_, idx) => idx !== i))}
      onOpenFile={() => window.electronAPI.openInFinder(configPaths.cursor.mcp)}
      onImport={(imported) => handleSave([...servers, ...imported])}
      copyTargetsForServer={(s) => makeMcpCopyTargets(configPaths, s, new Set<McpCopyDestination>(['cursor']), showToast, t)}
      autoTest={autoTest}
    />
  )
}

// ── Gemini CLI MCP Sub-view ──

function GeminiMcpView({ configPaths, autoTest }: { configPaths: ConfigPaths; autoTest?: boolean }) {
  const { t } = useI18n()
  const [servers, setServers] = useState<McpServer[]>([])
  const [rawContent, setRawContent] = useState('')
  const [editing, setEditing] = useState<EditingServer | null>(null)
  const [editingIndex, setEditingIndex] = useState(-1)
  const [fileExists, setFileExists] = useState(false)
  const { showToast } = useToast()

  const load = useCallback(async () => {
    const content = await window.electronAPI.readFile(configPaths.gemini.settings)
    if (content) {
      setRawContent(content)
      setServers(parseGeminiMcpServers(content))
      setFileExists(true)
    } else {
      setFileExists(false)
    }
  }, [configPaths])

  useEffect(() => { load() }, [load])

  async function handleSave(newServers: McpServer[]) {
    try {
      const newContent = updateGeminiMcpServers(rawContent, newServers)
      const ok = await window.electronAPI.writeFile(configPaths.gemini.settings, newContent)
      if (!ok) throw new Error('write returned false')
      setRawContent(newContent)
      setServers(newServers)
      setFileExists(true)
      showToast('success', t('toast.saved'))
    } catch (err: any) {
      showToast('error', t('toast.save_failed', { error: err?.message || 'unknown' }))
    }
  }

  return (
    <McpListSection
      title={t('mcp.gemini_title')}
      subtitle={fileExists ? t('mcp.gemini_subtitle_exists') : t('mcp.gemini_subtitle_missing')}
      servers={servers}
      editing={editing}
      editingIndex={editingIndex}
      setEditing={setEditing}
      onEdit={(i) => { setEditingIndex(i); setEditing(serverToEdit(servers[i])) }}
      onAdd={() => { setEditingIndex(-1); setEditing(emptyEdit()) }}
      onCancelEdit={() => { setEditing(null); setEditingIndex(-1) }}
      onSaveEdit={(e) => {
        const server = editToServer(e)
        const newList = editingIndex >= 0
          ? servers.map((s, i) => i === editingIndex ? server : s)
          : [...servers, server]
        handleSave(newList)
        setEditing(null); setEditingIndex(-1)
      }}
      onDelete={(i) => handleSave(servers.filter((_, idx) => idx !== i))}
      onOpenFile={() => window.electronAPI.openInFinder(configPaths.gemini.settings)}
      onImport={(imported) => handleSave([...servers, ...imported])}
      copyTargetsForServer={(s) => makeMcpCopyTargets(configPaths, s, new Set<McpCopyDestination>(['gemini']), showToast, t)}
      autoTest={autoTest}
    />
  )
}

// ── Claude MCP Sub-view ──

function ClaudeMcpView({ configPaths, autoTest }: { configPaths: ConfigPaths; autoTest?: boolean }) {
  const { t } = useI18n()
  const [stateGroups, setStateGroups] = useState<McpGroup[]>([])
  const [stateRaw, setStateRaw] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [editTarget, setEditTarget] = useState<{ groupKey: string; index: number } | null>(null)
  const [editing, setEditing] = useState<EditingServer | null>(null)
  const [addTarget, setAddTarget] = useState<string | null>(null)
  const { showToast } = useToast()

  const load = useCallback(async () => {
    const stateContent = await window.electronAPI.readFile(configPaths.claude.state)
    if (stateContent) {
      setStateRaw(stateContent)
      setStateGroups(parseClaudeStateMcp(stateContent))
    }
  }, [configPaths])

  useEffect(() => { load() }, [load])

  // Default expansion: once groups are available, expand Global MCP by default.
  // This is intentionally one-time (doesn't fight user toggles).
  useEffect(() => {
    if (expandedGroups.size > 0) return
    if (stateGroups.length === 0) return

    const next = new Set<string>()
    const hasGlobal = stateGroups.some((g) => g.scope === 'global')
    if (hasGlobal) next.add('global')
    if (next.size > 0) setExpandedGroups(next)
  }, [stateGroups, expandedGroups.size])

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function startEdit(groupKey: string, index: number, server: McpServer) {
    setEditTarget({ groupKey, index }); setEditing(serverToEdit(server)); setAddTarget(null)
  }
  function startAdd(groupKey: string) {
    setAddTarget(groupKey); setEditing(emptyEdit()); setEditTarget(null)
  }
  function cancelEdit() { setEditing(null); setEditTarget(null); setAddTarget(null) }

  async function saveStateGlobal(servers: McpServer[]) {
    try {
      const c = updateClaudeStateMcpGlobal(stateRaw, servers)
      const ok = await window.electronAPI.writeFile(configPaths.claude.state, c)
      if (!ok) throw new Error('write returned false')
      setStateRaw(c); setStateGroups(parseClaudeStateMcp(c))
      showToast('success', t('toast.saved'))
    } catch (err: any) {
      showToast('error', t('toast.save_failed', { error: err?.message || 'unknown' }))
    }
  }
  async function handleSaveEdit(groupKey: string, editData: EditingServer, index: number) {
    const server = editToServer(editData)
    if (groupKey !== 'global') return
    const g = stateGroups.find((g) => g.scope === 'global')
    const l = g?.servers || []
    await saveStateGlobal(index >= 0 ? l.map((s, i) => i === index ? server : s) : [...l, server])
    cancelEdit()
  }

  async function handleDelete(groupKey: string, index: number) {
    if (groupKey !== 'global') return
    const g = stateGroups.find((g) => g.scope === 'global')
    if (g) await saveStateGlobal(g.servers.filter((_, i) => i !== index))
  }

  const renderGroups: RenderGroup[] = []
  const gg = stateGroups.find((g) => g.scope === 'global')
  if (gg) renderGroups.push({
    key: 'global',
    label: t('mcp.global_mcp'),
    hint: '~/.claude.json → mcpServers',
    filePath: configPaths.claude.state,
    icon: <Globe size={14} className="text-amber-400" />,
    servers: gg.servers,
    onImport: async (imported) => saveStateGlobal([...gg.servers, ...imported]),
  })

  return (
    <GroupedMcpView
      groups={renderGroups}
      expandedGroups={expandedGroups}
      toggleGroup={toggleGroup}
      editTarget={editTarget}
      addTarget={addTarget}
      editing={editing}
      setEditing={setEditing}
      startEdit={startEdit}
      startAdd={startAdd}
      cancelEdit={cancelEdit}
      handleSaveEdit={handleSaveEdit}
      handleDelete={handleDelete}
      copyTargetsForServer={(server, groupKey) => {
        const ex = new Set<McpCopyDestination>()
        if (groupKey === 'global') ex.add('claude-global')
        return makeMcpCopyTargets(configPaths, server, ex, showToast, t)
      }}
      autoTest={autoTest}
    />
  )
}

// ── Project Folders MCP Sub-view ──

interface ProjectMcpEntry {
  source: string
  label: string
  filePath: string
  servers: McpServer[]
  fileExists: boolean
}

interface ProjectFolderState {
  path: string
  name: string
  entries: ProjectMcpEntry[]
  totalServers: number
}

function ProjectFoldersMcpView({ configPaths, autoTest }: { configPaths: ConfigPaths; autoTest?: boolean }) {
  const { t } = useI18n()
  const { addFolder, removeFolder, isUserAdded } = useProjectFolders(configPaths)
  const [allProjects, setAllProjects] = useState<ProjectFolderState[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [editTarget, setEditTarget] = useState<{ groupKey: string; index: number } | null>(null)
  const [editing, setEditing] = useState<EditingServer | null>(null)
  const [addTarget, setAddTarget] = useState<string | null>(null)
  const [importTarget, setImportTarget] = useState<{ label: string; existingNames: string[]; onImport: (servers: McpServer[]) => Promise<void> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const projectMap = new Map<string, ProjectFolderState>()

    function getOrCreate(dir: string): ProjectFolderState {
      if (!projectMap.has(dir)) {
        projectMap.set(dir, { path: dir, name: dir.split('/').pop() || dir, entries: [], totalServers: 0 })
      }
      return projectMap.get(dir)!
    }

    const stateContent = await window.electronAPI.readFile(configPaths.claude.state)
    if (stateContent) {
      const groups = parseClaudeStateMcp(stateContent)
      for (const g of groups.filter((g) => g.scope === 'project')) {
        const ps = getOrCreate(g.projectPath!)
        ps.entries.push({
          source: 'Claude Code',
          label: '~/.claude.json',
          filePath: configPaths.claude.state,
          servers: g.servers,
          fileExists: true,
        })
      }
    }

    for (const dir of loadSavedFolders()) {
      const ps = getOrCreate(dir)
      const probe = await window.electronAPI.probeProjectMcp(dir)

      const mcpFile = probe.files.find((f) => f.label === '.mcp.json')
      ps.entries.push({
        source: '.mcp.json',
        label: '.mcp.json',
        filePath: probe.mcpJsonPath,
        servers: mcpFile?.content ? parseMcpJson(mcpFile.content) : [],
        fileExists: !!mcpFile,
      })

      const cursorFile = probe.files.find((f) => f.label === '.cursor/mcp.json')
      if (cursorFile) {
        ps.entries.push({
          source: 'Cursor',
          label: '.cursor/mcp.json',
          filePath: probe.cursorMcpPath,
          servers: cursorFile.content ? parseMcpJson(cursorFile.content) : [],
          fileExists: true,
        })
      }
    }

    for (const ps of projectMap.values()) {
      ps.totalServers = ps.entries.reduce((sum, e) => sum + e.servers.length, 0)
    }

    setAllProjects(Array.from(projectMap.values()))
    setLoading(false)
  }, [configPaths, revision])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleAddFolder() {
    const selected = await addFolder()
    if (selected) {
      setExpandedGroups((prev) => new Set([...prev, selected]))
      setRevision((r) => r + 1)
    }
  }

  function handleRemoveFolder(dir: string) {
    removeFolder(dir)
    setAllProjects((prev) => prev.filter((p) => p.path !== dir))
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  // editTarget.groupKey = "projectPath::entryIndex"
  function entryKey(projectPath: string, entryIdx: number) { return `${projectPath}::${entryIdx}` }
  function parseEntryKey(key: string) { const i = key.lastIndexOf('::'); return { projectPath: key.slice(0, i), entryIdx: parseInt(key.slice(i + 2)) } }

  function startEdit(groupKey: string, index: number, server: McpServer) {
    setEditTarget({ groupKey, index }); setEditing(serverToEdit(server)); setAddTarget(null)
  }
  function startAdd(groupKey: string) {
    setAddTarget(groupKey); setEditing(emptyEdit()); setEditTarget(null)
  }
  function cancelEdit() { setEditing(null); setEditTarget(null); setAddTarget(null) }

  function findEntry(gk: string): { ps: ProjectFolderState; entry: ProjectMcpEntry; entryIdx: number } | null {
    const { projectPath, entryIdx } = parseEntryKey(gk)
    const ps = allProjects.find((p) => p.path === projectPath)
    if (!ps || !ps.entries[entryIdx]) return null
    return { ps, entry: ps.entries[entryIdx], entryIdx }
  }

  const { showToast } = useToast()

  async function saveEntry(entry: ProjectMcpEntry, projectPath: string, newList: McpServer[]) {
    if (entry.source === 'Claude Code') {
      const raw = await window.electronAPI.readFile(configPaths.claude.state)
      if (!raw) throw new Error('Cannot read ~/.claude.json')
      const ok = await window.electronAPI.writeFile(configPaths.claude.state, updateClaudeStateProjectMcp(raw, projectPath, newList))
      if (!ok) throw new Error('write returned false')
    } else {
      const ok = await window.electronAPI.writeFile(entry.filePath, serializeMcpJson(newList))
      if (!ok) throw new Error('write returned false')
    }
  }

  async function handleSaveEdit(groupKey: string, editData: EditingServer, index: number) {
    const found = findEntry(groupKey)
    if (!found) return
    const { ps, entry, entryIdx } = found
    const server = editToServer(editData)
    const newList = index >= 0 ? entry.servers.map((s, i) => i === index ? server : s) : [...entry.servers, server]
    try {
      await saveEntry(entry, ps.path, newList)
      setAllProjects((prev) => prev.map((p) => {
        if (p.path !== ps.path) return p
        const newEntries = [...p.entries]
        newEntries[entryIdx] = { ...entry, servers: newList, fileExists: true }
        return { ...p, entries: newEntries, totalServers: newEntries.reduce((s, e) => s + e.servers.length, 0) }
      }))
      cancelEdit()
      showToast('success', t('toast.saved'))
    } catch (err: any) {
      showToast('error', t('toast.save_failed', { error: err?.message || 'unknown' }))
    }
  }

  async function handleDelete(groupKey: string, index: number) {
    const found = findEntry(groupKey)
    if (!found) return
    const { ps, entry, entryIdx } = found
    const newList = entry.servers.filter((_, i) => i !== index)
    try {
      await saveEntry(entry, ps.path, newList)
      setAllProjects((prev) => prev.map((p) => {
        if (p.path !== ps.path) return p
        const newEntries = [...p.entries]
        newEntries[entryIdx] = { ...entry, servers: newList }
        return { ...p, entries: newEntries, totalServers: newEntries.reduce((s, e) => s + e.servers.length, 0) }
      }))
      showToast('success', t('toast.deleted'))
    } catch (err: any) {
      showToast('error', t('toast.delete_failed', { error: err?.message || 'unknown' }))
    }
  }

  function openImport(ps: ProjectFolderState, entry: ProjectMcpEntry) {
    setImportTarget({
      label: `${ps.name} · ${entry.label}`,
      existingNames: entry.servers.map((server) => server.name),
      onImport: async (imported) => {
        const nextServers = [...entry.servers, ...imported]
        await saveEntry(entry, ps.path, nextServers)
        setAllProjects((prev) => prev.map((project) => {
          if (project.path !== ps.path) return project
          const newEntries = project.entries.map((item) => (
            item.filePath === entry.filePath && item.source === entry.source
              ? { ...item, servers: nextServers, fileExists: true }
              : item
          ))
          return {
            ...project,
            entries: newEntries,
            totalServers: newEntries.reduce((sum, item) => sum + item.servers.length, 0),
          }
        }))
        showToast('success', t('toast.saved'))
      },
    })
  }

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {t('mcp.projects.desc', { code: '~/.claude.json' })}
        </p>
      </div>

      {loading && allProjects.length === 0 && (
        <div className="glass p-8 text-center"><p className="text-sm text-text-muted">{t('common.loading')}</p></div>
      )}

      {allProjects.map((ps) => {
        const isExpanded = expandedGroups.has(ps.path)
        const userAdded = isUserAdded(ps.path)
        const sources = [...new Set(ps.entries.map((e) => e.source))]
        return (
          <div key={ps.path} className="glass overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3">
              <button onClick={() => toggleGroup(ps.path)} className="flex items-center gap-2.5 flex-1 min-w-0">
                {isExpanded ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
                <Folder size={14} className="text-purple-400 flex-shrink-0" />
                <span className="text-sm font-medium text-text-primary truncate">{ps.name}</span>
                <span className="badge bg-surface-4 text-text-muted ml-1">{ps.totalServers}</span>
                {sources.map((src) => (
                  <span key={src} className={`badge text-[10px] ${SOURCE_BADGE[src] || 'bg-surface-4 text-text-muted'}`}>{src}</span>
                ))}
              </button>
              <span className="text-[11px] text-text-muted truncate max-w-[200px] hidden md:block">{ps.path}</span>
              <button onClick={() => window.electronAPI.openInFinder(ps.path)}
                className="p-1.5 rounded-md hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors flex-shrink-0" title={t('common.open_in_finder')}>
                <FolderOpen size={13} />
              </button>
              {userAdded && (
                <button onClick={() => handleRemoveFolder(ps.path)}
                  className="p-1.5 rounded-md hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors flex-shrink-0" title={t('common.remove_from_list')}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {isExpanded && (
              <div className="border-t border-border/[0.04]">
                {ps.entries.map((entry, ei) => {
                  const gk = entryKey(ps.path, ei)
                  const isEditingThis = editTarget?.groupKey === gk || addTarget === gk
                  const badgeCls = SOURCE_BADGE[entry.source] || 'bg-surface-4 text-text-muted'
                  return (
                    <div key={ei} className={`px-4 py-3 space-y-2 ${ei > 0 ? 'border-t border-border/[0.03]' : ''}`}>
                      <div className="flex items-center gap-1.5">
                        <FileJson size={12} className="text-text-muted" />
                        <span className="text-[11px] text-text-muted font-mono truncate">{entry.label}</span>
                        <span className={`badge text-[10px] ${badgeCls}`}>{entry.source}</span>
                        {!entry.fileExists && (
                          <span className="badge bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 text-[10px] flex items-center gap-1">
                            <AlertCircle size={10} /> {t('mcp.file_not_exist')}
                          </span>
                        )}
                        <span className="flex-1" />
                        <button
                          onClick={() => openImport(ps, entry)}
                          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-text-muted hover:bg-surface-4 hover:text-text-primary transition-colors"
                          title={t('mcp.quick_import')}
                        >
                          <Download size={11} />
                          {t('mcp.quick_import')}
                        </button>
                        <button
                          onClick={() => window.electronAPI.openInFinder(entry.filePath)}
                          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-text-muted hover:bg-surface-4 hover:text-text-primary transition-colors"
                          title={t('common.open_in_finder')}
                        >
                          <FolderOpen size={11} />
                          {t('common.open_file')}
                        </button>
                      </div>

                      {entry.servers.map((server, si) => (
                        <ServerRow
                          key={server.name + si}
                          server={server}
                          onEdit={() => startEdit(gk, si, server)}
                          onDelete={() => handleDelete(gk, si)}
                          copyTargets={makeMcpCopyTargets(configPaths, server, new Set(), showToast, t)}
                          autoTest={autoTest}
                        />
                      ))}

                      {entry.servers.length === 0 && !isEditingThis && (
                        <p className="text-xs text-text-muted py-1 text-center">
                          {entry.fileExists ? t('mcp.no_servers') : t('mcp.auto_create')}
                        </p>
                      )}

                      {isEditingThis && editing && (
                        <EditForm editing={editing} setEditing={setEditing} onCancel={cancelEdit}
                          onSave={() => { if (!editing.name.trim()) return; handleSaveEdit(gk, editing, editTarget?.index ?? -1) }}
                          isNew={addTarget !== null}
                          existingNames={entry.servers.map((s) => s.name)} />
                      )}

                      {!isEditingThis && (
                        <button onClick={() => startAdd(gk)}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-border/[0.06] text-[11px] text-text-muted hover:border-accent/40 hover:text-accent transition-all">
                          <Plus size={12} /> {t('mcp.add')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {allProjects.length === 0 && (
        <div className="glass p-10 text-center space-y-3">
          <FolderPlus size={36} className="mx-auto text-text-muted" />
          <p className="text-sm text-text-secondary">{t('mcp.no_projects')}</p>
          <p className="text-xs text-text-muted">{t('mcp.no_projects_hint')}</p>
        </div>
      )}

      <button onClick={handleAddFolder}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border/[0.1] text-sm text-text-secondary hover:border-accent/50 hover:text-accent hover:bg-accent/5 transition-all">
        <FolderPlus size={16} />
        {t('common.add_project_folder')}
      </button>
    </div>
    {importTarget && (
      <QuickImportModal
        targetLabel={importTarget.label}
        existingNames={importTarget.existingNames}
        onClose={() => setImportTarget(null)}
        onImport={async (servers) => {
          await importTarget.onImport(servers)
          setImportTarget(null)
        }}
      />
    )}
    </>
  )
}

// ── Shared Types & Components ──

interface RenderGroup {
  key: string
  label: string
  hint: string
  filePath?: string
  icon: React.ReactNode
  servers: McpServer[]
  onImport?: (servers: McpServer[]) => Promise<void> | void
}

function GroupedMcpView({
  groups, expandedGroups, toggleGroup,
  editTarget, addTarget, editing, setEditing,
  startEdit, startAdd, cancelEdit, handleSaveEdit, handleDelete,
  copyTargetsForServer, autoTest,
}: {
  groups: RenderGroup[]
  expandedGroups: Set<string>
  toggleGroup: (key: string) => void
  editTarget: { groupKey: string; index: number } | null
  addTarget: string | null
  editing: EditingServer | null
  setEditing: (e: EditingServer) => void
  startEdit: (groupKey: string, index: number, server: McpServer) => void
  startAdd: (groupKey: string) => void
  cancelEdit: () => void
  handleSaveEdit: (groupKey: string, editData: EditingServer, index: number) => void
  handleDelete: (groupKey: string, index: number) => void
  copyTargetsForServer?: (server: McpServer, groupKey: string) => { label: string; onCopy: () => Promise<void> }[]
  autoTest?: boolean
}) {
  const { t } = useI18n()
  const [importTarget, setImportTarget] = useState<RenderGroup | null>(null)
  return (
    <>
    <div className="space-y-4">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.key)
        const isEditingThis = editTarget?.groupKey === group.key || addTarget === group.key
        return (
          <div key={group.key} className="glass overflow-hidden">
            <div className="flex items-center px-4 py-3 hover:bg-surface-3/50 transition-colors">
              <button
                onClick={() => toggleGroup(group.key)}
                className="flex items-center gap-2.5 flex-1 min-w-0"
              >
                {isExpanded ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
                {group.icon}
                <span className="text-sm font-medium text-text-primary">{group.label}</span>
                <span className="badge bg-surface-4 text-text-muted ml-1">{group.servers.length}</span>
                <span className="flex-1" />
                <span className="text-[11px] text-text-muted truncate max-w-[250px]">{group.hint}</span>
              </button>
              {group.onImport && (
                <button
                  onClick={(e) => { e.stopPropagation(); setImportTarget(group) }}
                  className="ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-muted hover:bg-surface-4 hover:text-text-primary transition-colors flex-shrink-0"
                  title={t('mcp.quick_import')}
                >
                  <Download size={13} />
                  {t('mcp.quick_import')}
                </button>
              )}
              {group.filePath && (
                <button
                  onClick={(e) => { e.stopPropagation(); window.electronAPI.openInFinder(group.filePath!) }}
                  className="ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-muted hover:bg-surface-4 hover:text-text-primary transition-colors flex-shrink-0"
                  title={t('common.open_in_finder')}
                >
                  <FolderOpen size={13} />
                  {t('common.open_file')}
                </button>
              )}
            </div>
            {isExpanded && (
              <div className="border-t border-border/[0.04] px-4 py-3 space-y-2">
                {group.servers.map((server, idx) => (
                  <ServerRow
                    key={server.name + idx}
                    server={server}
                    onEdit={() => startEdit(group.key, idx, server)}
                    onDelete={() => handleDelete(group.key, idx)}
                    copyTargets={copyTargetsForServer?.(server, group.key)}
                    autoTest={autoTest}
                  />
                ))}
                {group.servers.length === 0 && !isEditingThis && <p className="text-xs text-text-muted py-2 text-center">{t('mcp.no_servers')}</p>}
                {isEditingThis && editing && (
                  <EditForm
                    editing={editing} setEditing={setEditing} onCancel={cancelEdit}
                    onSave={() => {
                      if (!editing.name.trim()) return
                      handleSaveEdit(editTarget?.groupKey || addTarget!, editing, editTarget?.index ?? -1)
                    }}
                    isNew={addTarget !== null}
                    existingNames={group.servers.map((s) => s.name)}
                  />
                )}
                {!isEditingThis && (
                  <button onClick={() => startAdd(group.key)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border/[0.08] text-xs text-text-muted hover:border-accent/40 hover:text-accent transition-all">
                    <Plus size={13} /> {t('mcp.add')}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {groups.length === 0 && (
        <div className="glass p-8 text-center">
          <Server size={32} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-secondary">{t('mcp.no_config')}</p>
        </div>
      )}
    </div>
    {importTarget?.onImport && (
      <QuickImportModal
        targetLabel={importTarget.label}
        existingNames={importTarget.servers.map((server) => server.name)}
        onClose={() => setImportTarget(null)}
        onImport={importTarget.onImport}
      />
    )}
    </>
  )
}

function ServerRow({
  server, onEdit, onDelete, autoTest, copyTargets,
}: {
  server: McpServer
  onEdit: () => void
  onDelete: () => void
  autoTest?: boolean
  copyTargets?: { label: string; onCopy: () => Promise<void> }[]
}) {
  const { t } = useI18n()
  const [testState, setTestState] = useState<'idle' | 'testing'>('idle')
  const [testResult, setTestResult] = useState<McpTestResult | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const copyWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!copyOpen) return
    function onDocMouseDown(e: MouseEvent) {
      if (copyWrapRef.current && !copyWrapRef.current.contains(e.target as Node)) setCopyOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [copyOpen])

  function handleDelete() {
    if (!confirm(t('confirm.delete_mcp', { name: server.name }))) return
    onDelete()
  }

  async function runTest() {
    setTestState('testing')
    setTestResult(null)
    try {
      const result = await window.electronAPI.testMcpServer({
        command: server.command,
        args: server.args,
        url: server.url,
        env: server.env,
        headers: server.headers,
      })
      setTestResult(result)
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || 'unknown' })
    }
    setTestState('idle')
  }

  useEffect(() => {
    if (autoTest && !testResult && testState === 'idle') runTest()
  }, [autoTest, testResult, testState])

  return (
    <div className="bg-surface-3/30 rounded-lg px-3 py-2.5 space-y-1.5">
      <div className="flex items-start justify-between group">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {server.url ? <Globe size={13} className="text-blue-400 flex-shrink-0" /> : <Terminal size={13} className="text-emerald-400 flex-shrink-0" />}
            <span className="font-medium text-sm text-text-primary">{server.name}</span>
            <span className="badge bg-surface-4 text-text-muted text-[10px]">{server.url ? 'URL' : 'Command'}</span>
            {server.type && <span className="badge bg-purple-500/15 text-purple-700 dark:text-purple-300 text-[10px]">{server.type}</span>}
          </div>
          <div className="mt-1 text-xs text-text-muted font-mono truncate">
            {server.url || `${server.command || ''} ${(server.args || []).join(' ')}`}
          </div>
          {(server.env && Object.keys(server.env).length > 0) || (server.headers && Object.keys(server.headers).length > 0) ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.keys(server.env || {}).map((key) => (
                <span key={`env-${key}`} className="badge bg-surface-4/60 text-text-muted text-[10px]">{key}</span>
              ))}
              {Object.keys(server.headers || {}).map((key) => (
                <span key={`header-${key}`} className="badge bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px]">{key}</span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3 items-start">
          {copyTargets && copyTargets.length > 0 && (
            <div className="relative" ref={copyWrapRef}>
              <button
                type="button"
                onClick={() => setCopyOpen((o) => !o)}
                className="p-1.5 rounded-md hover:bg-sky-500/15 text-text-muted hover:text-sky-600 dark:hover:text-sky-300 transition-colors"
                title={t('mcp.copy')}
              >
                <Copy size={13} />
              </button>
              {copyOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[200px] max-w-[280px] rounded-lg border border-border/[0.12] bg-surface-1 py-1 shadow-xl">
                  {copyTargets.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="w-full px-3 py-2 text-left text-xs text-text-primary hover:bg-surface-3 transition-colors"
                      onClick={async () => {
                        setCopyOpen(false)
                        await item.onCopy()
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={runTest} disabled={testState === 'testing'}
            className="p-1.5 rounded-md hover:bg-amber-500/20 text-text-muted hover:text-amber-700 dark:text-amber-300 transition-colors disabled:opacity-50"
            title={t('mcp.test')}>
            {testState === 'testing' ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          </button>
          <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors"><Edit3 size={13} /></button>
          <button onClick={handleDelete} className="p-1.5 rounded-md hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
        </div>
      </div>
      {testState === 'testing' && (
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <Loader2 size={11} className="animate-spin" />
          {t('mcp.testing')}
        </div>
      )}
      {testResult && (
        <div className={`flex items-center gap-1.5 text-[11px] ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {testResult.ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
          <span className="font-medium">{testResult.ok ? t('mcp.test_ok') : t('mcp.test_fail')}</span>
          <span className="text-text-muted truncate">— {testResult.message}</span>
        </div>
      )}
    </div>
  )
}

function QuickImportModal({
  targetLabel,
  existingNames,
  onClose,
  onImport,
}: {
  targetLabel: string
  existingNames: string[]
  onClose: () => void
  onImport: (servers: McpServer[]) => Promise<void> | void
}) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const [importing, setImporting] = useState(false)

  const parsed = useMemo(() => parseMcpImportInput(input), [input])
  const prepared = useMemo(
    () => (parsed ? prepareImportedServers(parsed.servers, existingNames) : null),
    [existingNames, parsed],
  )
  const warnings = useMemo(
    () => [...(parsed?.warnings || []), ...(prepared?.warnings || [])],
    [parsed, prepared],
  )

  async function handleImport() {
    if (!prepared || !prepared.servers.length) return
    setImporting(true)
    try {
      await onImport(prepared.servers)
      onClose()
    } finally {
      setImporting(false)
    }
  }

  const showParseFailure = input.trim().length > 0 && !parsed

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl border border-border/10 bg-surface-1 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-border/[0.06] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-text-primary">{t('mcp.quick_import')}</h3>
            <p className="mt-1 text-xs text-text-muted">{t('mcp.import_desc', { target: targetLabel })}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-[11px] text-text-muted">{t('mcp.import_input')}</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={9}
              placeholder={t('mcp.import_placeholder')}
              className="w-full resize-none rounded-xl border border-border/[0.08] bg-surface-2 px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="rounded-xl border border-border/[0.08] bg-surface-2/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-text-secondary">{t('mcp.detected_format')}</span>
                <span className="badge bg-surface-4 text-text-muted text-[10px]">
                  {parsed?.format || (showParseFailure ? t('mcp.import_unrecognized') : t('mcp.import_waiting'))}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {prepared?.servers.length ? prepared.servers.map((server, index) => (
                  <div key={`${server.name}-${index}`} className="rounded-lg border border-border/[0.06] bg-surface-3/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{server.name}</span>
                      <span className="badge bg-surface-4 text-text-muted text-[10px]">{server.type || (server.url ? 'http' : 'stdio')}</span>
                    </div>
                    <div className="mt-1 truncate text-xs font-mono text-text-muted">
                      {server.url || `${server.command || ''} ${(server.args || []).join(' ')}`.trim()}
                    </div>
                    {(server.headers && Object.keys(server.headers).length > 0) || (server.env && Object.keys(server.env).length > 0) ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.keys(server.headers || {}).map((key) => (
                          <span key={`header-${key}`} className="badge bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px]">{key}</span>
                        ))}
                        {Object.keys(server.env || {}).map((key) => (
                          <span key={`env-${key}`} className="badge bg-surface-4 text-text-muted text-[10px]">{key}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )) : (
                  <p className="text-xs text-text-muted">
                    {showParseFailure ? t('mcp.import_parse_failed') : t('mcp.import_preview_empty')}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/[0.08] bg-surface-2/60 p-4">
              <h4 className="text-xs font-medium text-text-secondary">{t('mcp.import_notes')}</h4>
              <div className="mt-3 space-y-2">
                {warnings.length > 0 ? warnings.map((warning, index) => (
                  <div key={index} className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    {warning}
                  </div>
                )) : (
                  <p className="text-xs text-text-muted">{t('mcp.import_no_warnings')}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/[0.06] px-5 py-4">
          <p className="text-[11px] text-text-muted">{t('mcp.import_footer')}</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-3">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleImport}
              disabled={!prepared || prepared.servers.length === 0 || importing}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {t('mcp.import_action')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditForm({ editing, setEditing, onCancel, onSave, isNew, existingNames = [] }: {
  editing: EditingServer; setEditing: (e: EditingServer) => void; onCancel: () => void; onSave: () => void; isNew: boolean; existingNames?: string[]
}) {
  const { t } = useI18n()
  const nameConflict = isNew && existingNames.includes(editing.name.trim())
  return (
    <div className="bg-surface-3/40 rounded-lg p-4 space-y-3 border border-border/[0.06]">
      <h4 className="text-xs font-semibold text-text-secondary">{isNew ? t('mcp.add_service') : t('mcp.edit_service')}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-text-muted mb-1">{t('common.name')}</label>
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t('mcp.example_name')}
            className={`w-full bg-surface-2 border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted ${nameConflict ? 'border-red-500/50' : 'border-border/[0.06]'}`} />
          {nameConflict && <p className="text-[10px] text-red-400 mt-0.5">{t('mcp.name_exists')}</p>}
        </div>
        <div>
          <label className="block text-[11px] text-text-muted mb-1">{t('common.type')}</label>
          <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as 'url' | 'command' })}
            className="w-full bg-surface-2 border border-border/[0.06] rounded-lg px-3 py-1.5 text-sm text-text-primary">
            <option value="command">Command</option>
            <option value="url">URL</option>
          </select>
        </div>
      </div>
      {editing.type === 'url' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] text-text-muted mb-1">URL</label>
              <input value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://mcp.example.com/mcp"
                className="w-full bg-surface-2 border border-border/[0.06] rounded-lg px-3 py-1.5 text-sm text-text-primary font-mono placeholder:text-text-muted" />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('mcp.transport')}</label>
              <select value={editing.transport} onChange={(e) => setEditing({ ...editing, transport: e.target.value as 'http' | 'sse' | 'stdio' })}
                className="w-full bg-surface-2 border border-border/[0.06] rounded-lg px-3 py-1.5 text-sm text-text-primary">
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </div>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Command</label>
            <input value={editing.command} onChange={(e) => setEditing({ ...editing, command: e.target.value })} placeholder={t('mcp.example_command')}
              className="w-full bg-surface-2 border border-border/[0.06] rounded-lg px-3 py-1.5 text-sm text-text-primary font-mono placeholder:text-text-muted" />
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">{t('common.args_per_line')}</label>
            <textarea value={editing.args} onChange={(e) => setEditing({ ...editing, args: e.target.value })} placeholder={"-y\n--registry\nhttp://example.com/"} rows={3}
              className="w-full bg-surface-2 border border-border/[0.06] rounded-lg px-3 py-1.5 text-sm text-text-primary font-mono placeholder:text-text-muted resize-none" />
          </div>
        </>
      )}
      <div>
        <label className="block text-[11px] text-text-muted mb-1">{t('common.env_vars')}</label>
        <textarea value={editing.env} onChange={(e) => setEditing({ ...editing, env: e.target.value })} placeholder={"API_KEY=your-key\nPORT=3000"} rows={2}
          className="w-full bg-surface-2 border border-border/[0.06] rounded-lg px-3 py-1.5 text-sm text-text-primary font-mono placeholder:text-text-muted resize-none" />
      </div>
      {editing.type === 'url' && (
        <div>
          <label className="block text-[11px] text-text-muted mb-1">{t('mcp.headers')}</label>
          <textarea value={editing.headers} onChange={(e) => setEditing({ ...editing, headers: e.target.value })} placeholder={"Authorization: Bearer ${env:API_KEY}\nX-Api-Key: your-key"} rows={3}
            className="w-full bg-surface-2 border border-border/[0.06] rounded-lg px-3 py-1.5 text-sm text-text-primary font-mono placeholder:text-text-muted resize-none" />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-surface-4 transition-colors">
          <X size={13} /> {t('common.cancel')}
        </button>
        <button onClick={onSave} disabled={!editing.name.trim() || nameConflict}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50">
          <Save size={13} /> {t('common.save')}
        </button>
      </div>
    </div>
  )
}

function McpListSection({ title, subtitle, servers, editing, editingIndex, setEditing, onEdit, onAdd, onCancelEdit, onSaveEdit, onDelete, onOpenFile, onImport, copyTargetsForServer, autoTest }: {
  title: string; subtitle: string; servers: McpServer[]; editing: EditingServer | null; editingIndex: number
  setEditing: (e: EditingServer) => void
  onEdit: (i: number) => void; onAdd: () => void; onCancelEdit: () => void; onSaveEdit: (e: EditingServer) => void; onDelete: (i: number) => void; onOpenFile: () => void
  onImport?: (servers: McpServer[]) => Promise<void> | void
  copyTargetsForServer?: (server: McpServer) => { label: string; onCopy: () => Promise<void> }[]
  autoTest?: boolean
}) {
  const { t } = useI18n()
  const [showImport, setShowImport] = useState(false)
  return (
    <>
    <div className="glass overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/[0.04]">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {onImport && (
            <button onClick={() => setShowImport(true)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
              <Download size={12} /> {t('mcp.quick_import')}
            </button>
          )}
          <button onClick={onOpenFile} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
            <FolderOpen size={12} /> {t('common.open_file')}
          </button>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {servers.map((s, i) => (
          <ServerRow
            key={s.name + i}
            server={s}
            onEdit={() => onEdit(i)}
            onDelete={() => onDelete(i)}
            copyTargets={copyTargetsForServer?.(s)}
            autoTest={autoTest}
          />
        ))}
        {servers.length === 0 && !editing && <p className="text-xs text-text-muted py-3 text-center">{t('mcp.no_servers')}</p>}
        {editing && <EditForm editing={editing} setEditing={setEditing} onCancel={onCancelEdit} onSave={() => editing && onSaveEdit(editing)} isNew={editingIndex < 0} existingNames={servers.map((s) => s.name)} />}
        {!editing && (
          <button onClick={onAdd} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border/[0.08] text-xs text-text-muted hover:border-accent/40 hover:text-accent transition-all">
            <Plus size={13} /> {t('mcp.add')}
          </button>
        )}
      </div>
    </div>
    {showImport && onImport && (
      <QuickImportModal
        targetLabel={title}
        existingNames={servers.map((server) => server.name)}
        onClose={() => setShowImport(false)}
        onImport={onImport}
      />
    )}
    </>
  )
}

// ── Main Component ──

export default function McpManager({ configPaths }: McpManagerProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<ToolTab>('codex')
  const autoTest = useMemo(() => loadSettings().autoTestMcp, [activeTab])

  const tabLabels: Record<ToolTab, string> = {
    codex: 'Codex',
    claude: 'Claude Code',
    cursor: 'Cursor',
    gemini: 'Gemini CLI',
    projects: t('mcp.tab.projects'),
  }

  if (!configPaths) return null

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t('mcp.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('mcp.subtitle')}</p>
      </div>

      <div className="flex gap-1 bg-surface-2 rounded-lg p-1">
        {TOOL_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-surface-4 text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tab.color }} />
            {tabLabels[tab.id]}
          </button>
        ))}
      </div>

      {activeTab === 'codex' && <CodexMcpView configPaths={configPaths} autoTest={autoTest} />}
      {activeTab === 'claude' && <ClaudeMcpView configPaths={configPaths} autoTest={autoTest} />}
      {activeTab === 'cursor' && <CursorMcpView configPaths={configPaths} autoTest={autoTest} />}
      {activeTab === 'gemini' && <GeminiMcpView configPaths={configPaths} autoTest={autoTest} />}
      {activeTab === 'projects' && <ProjectFoldersMcpView configPaths={configPaths} autoTest={autoTest} />}
    </div>
  )
}
