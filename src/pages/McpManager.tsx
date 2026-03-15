import { useState, useEffect, useCallback, useMemo } from 'react'
import { useI18n } from '../lib/i18n'
import {
  Plus, Trash2, Edit3, Save, X, Server, Globe, Terminal,
  FolderOpen, ChevronDown, ChevronRight, Folder, FolderPlus,
  FileJson, AlertCircle, Zap, Loader2, CheckCircle2, XCircle,
} from 'lucide-react'
import { ConfigPaths, McpServer, McpGroup, McpTestResult } from '../types'
import {
  parseCodexMcpServers,
  updateCodexMcpServers,
  parseGeminiMcpServers,
  updateGeminiMcpServers,
  parseClaudeSettingsMcp,
  updateClaudeSettingsMcp,
  parseClaudeStateMcp,
  updateClaudeStateMcpGlobal,
  updateClaudeStateProjectMcp,
} from '../lib/parsers'
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
  url: string
  command: string
  args: string
  env: string
}

function emptyEdit(): EditingServer {
  return { name: '', type: 'command', url: '', command: '', args: '', env: '' }
}

function serverToEdit(s: McpServer): EditingServer {
  return {
    name: s.name,
    type: s.url ? 'url' : 'command',
    url: s.url || '',
    command: s.command || '',
    args: (s.args || []).join('\n'),
    env: s.env ? Object.entries(s.env).map(([k, v]) => `${k}=${v}`).join('\n') : '',
  }
}

function editToServer(e: EditingServer): McpServer {
  const server: McpServer = { name: e.name }
  if (e.type === 'url') {
    server.url = e.url
  } else {
    server.command = e.command
    const args = e.args.split('\n').map((a) => a.trim()).filter(Boolean)
    if (args.length) server.args = args
  }
  if (e.env.trim()) {
    const env: Record<string, string> = {}
    e.env.split('\n').forEach((line) => {
      const idx = line.indexOf('=')
      if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    })
    server.env = env
  }
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
      url: config.url,
      type: config.type,
      env: config.env,
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
    mcpServers[s.name] = entry
  }
  return JSON.stringify({ mcpServers }, null, 2)
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
      autoTest={autoTest}
    />
  )
}

// ── Claude MCP Sub-view ──

function ClaudeMcpView({ configPaths, autoTest }: { configPaths: ConfigPaths; autoTest?: boolean }) {
  const { t } = useI18n()
  const [settingsServers, setSettingsServers] = useState<McpServer[]>([])
  const [settingsRaw, setSettingsRaw] = useState('')
  const [stateGroups, setStateGroups] = useState<McpGroup[]>([])
  const [stateRaw, setStateRaw] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['global', 'settings']))
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
    const settingsContent = await window.electronAPI.readFile(configPaths.claude.settings)
    if (settingsContent) {
      setSettingsRaw(settingsContent)
      setSettingsServers(parseClaudeSettingsMcp(settingsContent))
    }
  }, [configPaths])

  useEffect(() => { load() }, [load])

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
  async function saveStateProject(pp: string, servers: McpServer[]) {
    try {
      const c = updateClaudeStateProjectMcp(stateRaw, pp, servers)
      const ok = await window.electronAPI.writeFile(configPaths.claude.state, c)
      if (!ok) throw new Error('write returned false')
      setStateRaw(c); setStateGroups(parseClaudeStateMcp(c))
      showToast('success', t('toast.saved'))
    } catch (err: any) {
      showToast('error', t('toast.save_failed', { error: err?.message || 'unknown' }))
    }
  }
  async function saveSettings(servers: McpServer[]) {
    try {
      const c = updateClaudeSettingsMcp(settingsRaw, servers)
      const ok = await window.electronAPI.writeFile(configPaths.claude.settings, c)
      if (!ok) throw new Error('write returned false')
      setSettingsRaw(c); setSettingsServers(parseClaudeSettingsMcp(c))
      showToast('success', t('toast.saved'))
    } catch (err: any) {
      showToast('error', t('toast.save_failed', { error: err?.message || 'unknown' }))
    }
  }

  async function handleSaveEdit(groupKey: string, editData: EditingServer, index: number) {
    const server = editToServer(editData)
    if (groupKey === 'settings') {
      const l = index >= 0 ? settingsServers.map((s, i) => i === index ? server : s) : [...settingsServers, server]
      await saveSettings(l)
    } else if (groupKey === 'global') {
      const g = stateGroups.find((g) => g.scope === 'global')
      const l = g?.servers || []
      await saveStateGlobal(index >= 0 ? l.map((s, i) => i === index ? server : s) : [...l, server])
    } else {
      const g = stateGroups.find((g) => g.projectPath === groupKey)
      const l = g?.servers || []
      await saveStateProject(groupKey, index >= 0 ? l.map((s, i) => i === index ? server : s) : [...l, server])
    }
    cancelEdit()
  }

  async function handleDelete(groupKey: string, index: number) {
    if (groupKey === 'settings') await saveSettings(settingsServers.filter((_, i) => i !== index))
    else if (groupKey === 'global') {
      const g = stateGroups.find((g) => g.scope === 'global')
      if (g) await saveStateGlobal(g.servers.filter((_, i) => i !== index))
    } else {
      const g = stateGroups.find((g) => g.projectPath === groupKey)
      if (g) await saveStateProject(groupKey, g.servers.filter((_, i) => i !== index))
    }
  }

  const renderGroups: RenderGroup[] = []
  renderGroups.push({ key: 'settings', label: 'settings.json', hint: '~/.claude/settings.json', filePath: configPaths.claude.settings, icon: <Server size={14} className="text-emerald-400" />, servers: settingsServers })
  const gg = stateGroups.find((g) => g.scope === 'global')
  if (gg) renderGroups.push({ key: 'global', label: t('mcp.global_mcp'), hint: '~/.claude.json → mcpServers', filePath: configPaths.claude.state, icon: <Globe size={14} className="text-amber-400" />, servers: gg.servers })

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

  return (
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
                        <button onClick={() => window.electronAPI.openInFinder(entry.filePath)}
                          className="p-1 rounded hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors" title={t('common.open_in_finder')}>
                          <FolderOpen size={11} />
                        </button>
                      </div>

                      {entry.servers.map((server, si) => (
                        <ServerRow key={server.name + si} server={server}
                          onEdit={() => startEdit(gk, si, server)}
                          onDelete={() => handleDelete(gk, si)}
                          autoTest={autoTest} />
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
}

function GroupedMcpView({
  groups, expandedGroups, toggleGroup,
  editTarget, addTarget, editing, setEditing,
  startEdit, startAdd, cancelEdit, handleSaveEdit, handleDelete, autoTest,
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
  autoTest?: boolean
}) {
  const { t } = useI18n()
  return (
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
              {group.filePath && (
                <button
                  onClick={(e) => { e.stopPropagation(); window.electronAPI.openInFinder(group.filePath!) }}
                  className="ml-2 p-1.5 rounded-md hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
                  title={t('common.open_in_finder')}
                >
                  <FolderOpen size={13} />
                </button>
              )}
            </div>
            {isExpanded && (
              <div className="border-t border-border/[0.04] px-4 py-3 space-y-2">
                {group.servers.map((server, idx) => (
                  <ServerRow key={server.name + idx} server={server} onEdit={() => startEdit(group.key, idx, server)} onDelete={() => handleDelete(group.key, idx)} autoTest={autoTest} />
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
  )
}

function ServerRow({ server, onEdit, onDelete, autoTest }: { server: McpServer; onEdit: () => void; onDelete: () => void; autoTest?: boolean }) {
  const { t } = useI18n()
  const [testState, setTestState] = useState<'idle' | 'testing'>('idle')
  const [testResult, setTestResult] = useState<McpTestResult | null>(null)

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
          {server.env && Object.keys(server.env).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.keys(server.env).map((key) => (
                <span key={key} className="badge bg-surface-4/60 text-text-muted text-[10px]">{key}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
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
        <div>
          <label className="block text-[11px] text-text-muted mb-1">URL</label>
          <input value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://mcp.example.com/mcp"
            className="w-full bg-surface-2 border border-border/[0.06] rounded-lg px-3 py-1.5 text-sm text-text-primary font-mono placeholder:text-text-muted" />
        </div>
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

function McpListSection({ title, subtitle, servers, editing, editingIndex, setEditing, onEdit, onAdd, onCancelEdit, onSaveEdit, onDelete, onOpenFile, autoTest }: {
  title: string; subtitle: string; servers: McpServer[]; editing: EditingServer | null; editingIndex: number
  setEditing: (e: EditingServer) => void
  onEdit: (i: number) => void; onAdd: () => void; onCancelEdit: () => void; onSaveEdit: (e: EditingServer) => void; onDelete: (i: number) => void; onOpenFile: () => void
  autoTest?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/[0.04]">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>
        </div>
        <button onClick={onOpenFile} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
          <FolderOpen size={12} /> {t('common.open_file')}
        </button>
      </div>
      <div className="px-4 py-3 space-y-2">
        {servers.map((s, i) => <ServerRow key={s.name + i} server={s} onEdit={() => onEdit(i)} onDelete={() => onDelete(i)} autoTest={autoTest} />)}
        {servers.length === 0 && !editing && <p className="text-xs text-text-muted py-3 text-center">{t('mcp.no_servers')}</p>}
        {editing && <EditForm editing={editing} setEditing={setEditing} onCancel={onCancelEdit} onSave={() => editing && onSaveEdit(editing)} isNew={editingIndex < 0} existingNames={servers.map((s) => s.name)} />}
        {!editing && (
          <button onClick={onAdd} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border/[0.08] text-xs text-text-muted hover:border-accent/40 hover:text-accent transition-all">
            <Plus size={13} /> {t('mcp.add')}
          </button>
        )}
      </div>
    </div>
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
