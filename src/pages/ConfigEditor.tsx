import { useState, useEffect, useCallback } from 'react'
import {
  Save, RotateCcw, FolderOpen, Check, FileText, Trash2,
  Folder, FolderPlus, ChevronDown, ChevronRight, Edit3,
} from 'lucide-react'
import { ConfigPaths, ProjectProbeConfig } from '../types'
import { useProjectFolders, TOOL_COLORS, TOOL_BADGE } from '../lib/projectFolders'
import { useToast } from '../lib/toast'
import { useI18n } from '../lib/i18n'

interface ConfigEditorProps {
  configPaths: ConfigPaths | null
}

type TabType = 'global' | 'projects'

// ── Global config files ──

interface ConfigFile {
  id: string
  label: string
  tool: string
  toolColor: string
  getPath: (paths: ConfigPaths) => string
  language: string
}

const CONFIG_FILES: ConfigFile[] = [
  { id: 'codex-config', label: 'config.toml', tool: 'Codex', toolColor: '#10b981', getPath: (p) => p.codex.config, language: 'toml' },
  { id: 'codex-agents', label: 'AGENTS.md', tool: 'Codex', toolColor: '#10b981', getPath: (p) => p.codex.agents, language: 'markdown' },
  { id: 'claude-state', label: '.claude.json', tool: 'Claude', toolColor: '#f59e0b', getPath: (p) => p.claude.state, language: 'json' },
  { id: 'claude-settings', label: 'settings.json', tool: 'Claude', toolColor: '#f59e0b', getPath: (p) => p.claude.settings, language: 'json' },
  { id: 'claude-settings-local', label: 'settings.local.json', tool: 'Claude', toolColor: '#f59e0b', getPath: (p) => p.claude.settingsLocal, language: 'json' },
  { id: 'claude-instructions', label: 'CLAUDE.md', tool: 'Claude', toolColor: '#f59e0b', getPath: (p) => p.claude.instructions, language: 'markdown' },
]

// ── Global Config View ──

function GlobalConfigView({ configPaths }: { configPaths: ConfigPaths }) {
  const [activeFile, setActiveFile] = useState<ConfigFile>(CONFIG_FILES[0])
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const { showToast } = useToast()
  const { t } = useI18n()

  const loadFile = useCallback(async () => {
    setLoading(true)
    const data = await window.electronAPI.readFile(activeFile.getPath(configPaths))
    const text = data || ''
    setContent(text)
    setOriginalContent(text)
    setLoading(false)
    setSaved(false)
  }, [configPaths, activeFile])

  useEffect(() => { loadFile() }, [loadFile])

  const isDirty = content !== originalContent

  function switchFile(file: ConfigFile) {
    if (isDirty && !confirm(t('confirm.unsaved_switch'))) return
    setActiveFile(file)
  }

  async function handleSave() {
    if (!isDirty) return
    try {
      const ok = await window.electronAPI.writeFile(activeFile.getPath(configPaths), content)
      if (!ok) throw new Error('write returned false')
      setOriginalContent(content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      showToast('error', t('toast.save_failed', { error: err?.message || 'unknown' }))
    }
  }

  return (
    <div className="flex gap-4 flex-1 min-h-0">
      <div className="w-56 flex-shrink-0 space-y-1">
        {CONFIG_FILES.map((file) => (
          <button key={file.id} onClick={() => switchFile(file)}
            className={`w-full text-left p-2.5 rounded-lg transition-all ${activeFile.id === file.id ? 'bg-accent/15 border border-accent/30' : 'hover:bg-surface-3'}`}>
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-text-muted flex-shrink-0" />
              <span className="text-sm font-medium text-text-primary truncate">{file.label}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: file.toolColor }} />
              <span className="text-[11px] text-text-muted">{file.tool}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0 glass overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/[0.06]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeFile.toolColor }} />
            <span className="text-sm font-medium text-text-primary">{activeFile.label}</span>
            <span className="badge bg-surface-4 text-text-muted text-[10px]">{activeFile.language}</span>
            {isDirty && <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => window.electronAPI.openInFinder(activeFile.getPath(configPaths))}
              className="p-1.5 rounded-md hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors" title={t('common.open_in_finder')}>
              <FolderOpen size={14} />
            </button>
            <button onClick={() => setContent(originalContent)} disabled={!isDirty}
              className="p-1.5 rounded-md hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors disabled:opacity-30" title="Revert">
              <RotateCcw size={14} />
            </button>
            <button onClick={handleSave} disabled={!isDirty}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${saved ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : isDirty ? 'bg-accent hover:bg-accent-hover text-white' : 'bg-surface-4 text-text-muted cursor-not-allowed'}`}>
              {saved ? <Check size={12} /> : <Save size={12} />} {saved ? t('common.saved') : t('common.save')}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><p className="text-sm text-text-muted">{t('common.loading')}</p></div>
        ) : (
          <textarea value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() } }}
            className="flex-1 bg-transparent text-sm text-text-primary font-mono p-4 resize-none leading-relaxed"
            placeholder={t('config.empty_placeholder')} />
        )}
      </div>
    </div>
  )
}

// ── Project Config View ──

interface ProjectConfigState {
  path: string
  name: string
  configs: ProjectProbeConfig[]
}

function ProjectConfigView({ configPaths }: { configPaths: ConfigPaths }) {
  const { discoverPaths, addFolder, removeFolder, isUserAdded } = useProjectFolders(configPaths)
  const [projects, setProjects] = useState<ProjectConfigState[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [editingFile, setEditingFile] = useState<{ path: string; content: string; original: string; label: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const { t } = useI18n()

  const loadAll = useCallback(async () => {
    setLoading(true)
    const allPaths = await discoverPaths()
    const results: ProjectConfigState[] = []
    for (const dir of allPaths) {
      const probe = await window.electronAPI.probeProjectMcp(dir)
      results.push({ path: dir, name: probe.projectName, configs: probe.configs })
    }
    setProjects(results)
    setLoading(false)
  }, [discoverPaths])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleAddFolder() {
    const selected = await addFolder()
    if (selected) setExpandedGroups((prev) => new Set([...prev, selected]))
  }

  function handleRemoveFolder(dir: string) {
    removeFolder(dir)
    setProjects((prev) => prev.filter((p) => p.path !== dir))
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const { showToast } = useToast()

  async function handleEditFile(config: ProjectProbeConfig) {
    if (config.isDir) { window.electronAPI.openInFinder(config.path); return }
    if (editingFile && editingFile.content !== editingFile.original) {
      if (!confirm(t('confirm.unsaved_switch'))) return
    }
    const content = await window.electronAPI.readFile(config.path) || ''
    setEditingFile({ path: config.path, content, original: content, label: config.label })
    setSaved(false)
  }

  async function handleSaveFile() {
    if (!editingFile) return
    try {
      const ok = await window.electronAPI.writeFile(editingFile.path, editingFile.content)
      if (!ok) throw new Error('write returned false')
      setEditingFile({ ...editingFile, original: editingFile.content })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      loadAll()
    } catch (err: any) {
      showToast('error', t('toast.save_failed', { error: err?.message || 'unknown' }))
    }
  }

  const isDirty = editingFile ? editingFile.content !== editingFile.original : false

  return (
    <div className="space-y-4 flex-1">
      <p className="text-xs text-text-muted">{t('config.projects.desc')}</p>

      {editingFile && (
        <div className="glass overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/[0.06]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary">{editingFile.label}</span>
              <span className="text-xs font-mono text-text-muted truncate">{editingFile.path}</span>
              {isDirty && <span className="w-2 h-2 rounded-full bg-amber-400" />}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setEditingFile({ ...editingFile, content: editingFile.original })} disabled={!isDirty}
                className="p-1.5 rounded-md hover:bg-surface-4 text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors">
                <RotateCcw size={13} />
              </button>
              <button onClick={handleSaveFile} disabled={!isDirty}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${saved ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : isDirty ? 'bg-accent hover:bg-accent-hover text-white' : 'bg-surface-4 text-text-muted cursor-not-allowed'}`}>
                {saved ? <Check size={12} /> : <Save size={12} />} {saved ? t('common.saved') : t('common.save')}
              </button>
              <button onClick={() => {
                if (isDirty && !confirm(t('confirm.unsaved_close'))) return
                setEditingFile(null)
              }} className="px-2 py-1 rounded-md text-xs text-text-muted hover:bg-surface-4 transition-colors">{t('common.close')}</button>
            </div>
          </div>
          <textarea value={editingFile.content} onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSaveFile() } }}
            spellCheck={false} className="w-full bg-transparent text-sm text-text-primary font-mono p-4 resize-none leading-relaxed h-72 focus:outline-none" />
        </div>
      )}

      {loading && projects.length === 0 && (
        <div className="glass p-8 text-center"><p className="text-sm text-text-muted">{t('common.loading')}</p></div>
      )}

      {projects.map((ps) => {
        const isExpanded = expandedGroups.has(ps.path)
        const userAdded = isUserAdded(ps.path)
        return (
          <div key={ps.path} className="glass overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 hover:bg-surface-3/50 transition-colors">
              <button onClick={() => toggleGroup(ps.path)} className="flex items-center gap-2.5 flex-1 min-w-0">
                {isExpanded ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
                <Folder size={14} className="text-purple-400 flex-shrink-0" />
                <span className="text-sm font-medium text-text-primary truncate">{ps.name}</span>
                <span className="badge bg-surface-4 text-text-muted ml-1">{ps.configs.length}</span>
              </button>
              <span className="text-[11px] text-text-muted truncate max-w-[250px] hidden md:block">{ps.path}</span>
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
              <div className="border-t border-border/[0.04] px-4 py-3 space-y-2">
                {ps.configs.length === 0 ? (
                  <p className="text-xs text-text-muted py-2 text-center">{t('config.no_config_detected')}</p>
                ) : ps.configs.map((config, i) => (
                  <div key={i} className="flex items-center justify-between group bg-surface-3/30 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText size={13} style={{ color: TOOL_COLORS[config.tool] || '#71717a' }} />
                      <span className="text-sm font-medium text-text-primary">{config.label}</span>
                      <span className={`badge text-[10px] ${TOOL_BADGE[config.tool] || 'bg-surface-4 text-text-muted'}`}>{config.tool}</span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditFile(config)}
                        className="p-1.5 rounded-md hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors"
                        title={config.isDir ? t('common.open_in_finder') : 'Edit'}>
                        {config.isDir ? <FolderOpen size={13} /> : <Edit3 size={13} />}
                      </button>
                      <button onClick={() => window.electronAPI.openInFinder(config.path)}
                        className="p-1.5 rounded-md hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors" title={t('common.open_in_finder')}>
                        <FolderOpen size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {!loading && projects.length === 0 && (
        <div className="glass p-10 text-center space-y-3">
          <FolderPlus size={36} className="mx-auto text-text-muted" />
          <p className="text-sm text-text-secondary">{t('common.no_project_folders')}</p>
          <p className="text-xs text-text-muted">{t('common.no_project_folders_hint')}</p>
        </div>
      )}

      <button onClick={handleAddFolder}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border/[0.1] text-sm text-text-secondary hover:border-accent/50 hover:text-accent hover:bg-accent/5 transition-all">
        <FolderPlus size={16} /> {t('common.add_project_folder')}
      </button>
    </div>
  )
}

// ── Main ──

export default function ConfigEditor({ configPaths }: ConfigEditorProps) {
  const [activeTab, setActiveTab] = useState<TabType>('global')
  const { t } = useI18n()

  if (!configPaths) return null

  return (
    <div className="p-6 h-full flex flex-col max-w-5xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('config.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('config.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-1 bg-surface-2 rounded-lg p-1 mb-5">
        {([
          { id: 'global' as TabType, label: t('config.tab.global'), color: '#10b981' },
          { id: 'projects' as TabType, label: t('config.tab.projects'), color: '#a855f7' },
        ]).map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-surface-4 text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
            }`}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tab.color }} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'global' && <GlobalConfigView configPaths={configPaths} />}
      {activeTab === 'projects' && <ProjectConfigView configPaths={configPaths} />}
    </div>
  )
}
