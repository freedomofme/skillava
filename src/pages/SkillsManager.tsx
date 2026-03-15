import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, FolderOpen, Trash2, Shield, User, Eye,
  Folder, FolderPlus, ChevronDown, ChevronRight,
} from 'lucide-react'
import { ConfigPaths, SkillInfo, SkillDetail, ProjectProbeSkill } from '../types'
import { useProjectFolders, TOOL_BADGE } from '../lib/projectFolders'
import { useI18n } from '../lib/i18n'

interface SkillsManagerProps {
  configPaths: ConfigPaths | null
}

type ToolTab = 'codex' | 'claude' | 'cursor' | 'gemini' | 'projects'

const TOOL_TABS: { id: ToolTab; color: string }[] = [
  { id: 'codex', color: '#10b981' },
  { id: 'claude', color: '#f59e0b' },
  { id: 'cursor', color: '#6366f1' },
  { id: 'gemini', color: '#4285f4' },
  { id: 'projects', color: '#a855f7' },
]

const SKILL_TOOL_COLORS: Record<string, string> = {
  'Claude Code': 'text-amber-400',
  'Codex': 'text-emerald-400',
  'Cursor': 'text-violet-400',
}

// ── Global Skills Tab (Codex / Cursor) ──

const SKILLS_DIR_MAP: Record<string, (cp: ConfigPaths) => string> = {
  codex: (cp) => cp.codex.skillsDir,
  claude: (cp) => cp.claude.skillsDir,
  cursor: (cp) => cp.cursor.skillsDir,
  gemini: (cp) => cp.gemini.skillsDir,
}

function GlobalSkillsView({ configPaths, toolTab }: { configPaths: ConfigPaths; toolTab: 'codex' | 'claude' | 'cursor' | 'gemini' }) {
  const { t } = useI18n()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [selectedSkill, setSelectedSkill] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    const dir = SKILLS_DIR_MAP[toolTab](configPaths)
    const data = await window.electronAPI.listSkills(dir)
    setSkills(data)
    setSelectedSkill(null)
    setLoading(false)
  }, [configPaths, toolTab])

  useEffect(() => { loadSkills() }, [loadSkills])

  async function handleSelect(skill: SkillInfo) {
    setSelectedSkill(await window.electronAPI.readSkill(skill.path))
  }

  async function handleDelete(skill: SkillInfo) {
    if (skill.isSystem) return
    if (!confirm(t('confirm.delete_skill', { name: skill.name }))) return
    await window.electronAPI.deleteDir(skill.path)
    loadSkills()
  }

  return (
    <div className="flex gap-4">
      <div className="w-72 flex-shrink-0 space-y-1.5">
        {loading ? (
          <div className="glass p-8 text-center"><p className="text-sm text-text-muted">{t('common.loading')}</p></div>
        ) : skills.length === 0 ? (
          <div className="glass p-8 text-center">
            <Sparkles size={32} className="mx-auto text-text-muted mb-3" />
            <p className="text-sm text-text-secondary">{t('skills.none_installed')}</p>
          </div>
        ) : skills.map((skill) => (
          <button key={skill.path} onClick={() => handleSelect(skill)}
            className={`w-full text-left p-3 rounded-lg transition-all ${selectedSkill?.path === skill.path ? 'bg-accent/15 border border-accent/30' : 'glass glass-hover'}`}>
            <div className="flex items-center gap-2">
              {skill.isSystem ? <Shield size={14} className="text-amber-400 flex-shrink-0" /> : <User size={14} className="text-blue-400 flex-shrink-0" />}
              <span className="text-sm font-medium text-text-primary truncate">{skill.name}</span>
            </div>
            {skill.description && <p className="text-xs text-text-muted mt-1 line-clamp-2">{skill.description}</p>}
            <span className={`badge text-[10px] mt-1.5 ${skill.isSystem ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'}`}>
              {skill.isSystem ? t('skills.system') : t('skills.user')}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0">
        {selectedSkill ? (
          <div className="glass p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">{selectedSkill.name}</h3>
              <div className="flex gap-1.5">
                <button onClick={() => window.electronAPI.openInFinder(selectedSkill.path)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-colors">
                  <FolderOpen size={12} /> {t('common.open')}
                </button>
                {!skills.find((s) => s.path === selectedSkill.path)?.isSystem && (
                  <button onClick={() => { const s = skills.find((s) => s.path === selectedSkill.path); if (s) handleDelete(s) }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-red-400 hover:bg-red-500/20 transition-colors">
                    <Trash2 size={12} /> {t('common.delete')}
                  </button>
                )}
              </div>
            </div>
            <div className="text-xs text-text-muted font-mono bg-surface-3 rounded-lg px-3 py-2">{selectedSkill.path}</div>
            <div className="flex gap-3 text-xs">
              {selectedSkill.hasAgents && <span className="badge bg-purple-500/20 text-purple-700 dark:text-purple-300">Agents: {selectedSkill.agents.length}</span>}
              {selectedSkill.hasReferences && <span className="badge bg-cyan-500/20 text-cyan-700 dark:text-cyan-300">References: {selectedSkill.references.length}</span>}
            </div>
            {selectedSkill.content && (
              <div>
                <h4 className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1.5"><Eye size={12} /> SKILL.md</h4>
                <pre className="bg-surface-3 rounded-lg p-4 text-xs text-text-secondary font-mono whitespace-pre-wrap overflow-auto max-h-96 leading-relaxed">{selectedSkill.content}</pre>
              </div>
            )}
          </div>
        ) : (
          <div className="glass p-12 text-center">
            <Sparkles size={40} className="mx-auto text-text-muted mb-3" />
            <p className="text-sm text-text-secondary">{t('skills.select_detail')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Project Skills Tab ──

interface ProjectSkillState {
  path: string
  name: string
  skills: ProjectProbeSkill[]
}

function ProjectSkillsView({ configPaths }: { configPaths: ConfigPaths }) {
  const { t } = useI18n()
  const { discoverPaths, addFolder, removeFolder, isUserAdded } = useProjectFolders(configPaths)
  const [projects, setProjects] = useState<ProjectSkillState[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedSkill, setSelectedSkill] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const allPaths = await discoverPaths()
    const results: ProjectSkillState[] = []
    for (const dir of allPaths) {
      const probe = await window.electronAPI.probeProjectMcp(dir)
      results.push({ path: dir, name: probe.projectName, skills: probe.skills })
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
    setExpandedGroups((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  async function handleSelectSkill(skill: ProjectProbeSkill) {
    const detail = await window.electronAPI.readSkill(skill.path)
    setSelectedSkill(detail)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        {t('skills.projects.desc_prefix')} <code className="px-1 py-0.5 rounded bg-surface-3 text-text-secondary">SKILL.md</code> {t('skills.projects.desc_suffix')}
      </p>

      {/* Skill detail (shown above project list when selected) */}
      {selectedSkill && (
        <div className="glass p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">{selectedSkill.name}</h3>
            <div className="flex gap-1.5">
              <button onClick={() => window.electronAPI.openInFinder(selectedSkill.path)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-text-secondary hover:bg-surface-4 hover:text-text-primary transition-colors">
                <FolderOpen size={12} /> {t('common.open')}
              </button>
              <button onClick={() => setSelectedSkill(null)}
                className="px-2.5 py-1.5 rounded-md text-xs text-text-muted hover:bg-surface-4 transition-colors">{t('common.close')}</button>
            </div>
          </div>
          <div className="text-xs text-text-muted font-mono bg-surface-3 rounded-lg px-3 py-2">{selectedSkill.path}</div>
          <div className="flex gap-3 text-xs">
            {selectedSkill.hasAgents && <span className="badge bg-purple-500/20 text-purple-700 dark:text-purple-300">Agents: {selectedSkill.agents.length}</span>}
            {selectedSkill.hasReferences && <span className="badge bg-cyan-500/20 text-cyan-700 dark:text-cyan-300">References: {selectedSkill.references.length}</span>}
          </div>
          {selectedSkill.content && (
            <div>
              <h4 className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1.5"><Eye size={12} /> SKILL.md</h4>
              <pre className="bg-surface-3 rounded-lg p-4 text-xs text-text-secondary font-mono whitespace-pre-wrap overflow-auto max-h-72 leading-relaxed">{selectedSkill.content}</pre>
            </div>
          )}
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
                <span className="badge bg-surface-4 text-text-muted ml-1">{ps.skills.length}</span>
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
                {ps.skills.length === 0 ? (
                  <p className="text-xs text-text-muted py-2 text-center">{t('skills.no_detected')}</p>
                ) : ps.skills.map((skill, i) => (
                  <div key={i} className={`flex items-center justify-between group rounded-lg px-3 py-2.5 cursor-pointer transition-all ${
                    selectedSkill?.path === skill.path ? 'bg-accent/15 border border-accent/30' : 'bg-surface-3/30 hover:bg-surface-3/60'
                  }`} onClick={() => handleSelectSkill(skill)}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Sparkles size={13} className={SKILL_TOOL_COLORS[skill.tool] || 'text-text-muted'} />
                      <span className="text-sm font-medium text-text-primary">{skill.name}</span>
                      <span className={`badge text-[10px] ${TOOL_BADGE[skill.tool] || 'bg-surface-4 text-text-muted'}`}>{skill.tool}</span>
                      {skill.description && <span className="text-xs text-text-muted truncate ml-1">{skill.description}</span>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); window.electronAPI.openInFinder(skill.path) }}
                      className="p-1.5 rounded-md hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors opacity-0 group-hover:opacity-100">
                      <FolderOpen size={13} />
                    </button>
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

export default function SkillsManager({ configPaths }: SkillsManagerProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<ToolTab>('codex')

  const tabLabels: Record<ToolTab, string> = {
    codex: 'Codex',
    claude: 'Claude Code',
    cursor: 'Cursor',
    gemini: 'Gemini CLI',
    projects: t('skills.tab.projects'),
  }

  if (!configPaths) return null

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t('skills.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('skills.subtitle')}</p>
      </div>

      <div className="flex gap-1 bg-surface-2 rounded-lg p-1">
        {TOOL_TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-surface-4 text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
            }`}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tab.color }} />
            {tabLabels[tab.id]}
          </button>
        ))}
      </div>

      {(activeTab === 'codex' || activeTab === 'claude' || activeTab === 'cursor' || activeTab === 'gemini') && <GlobalSkillsView configPaths={configPaths} toolTab={activeTab} />}
      {activeTab === 'projects' && <ProjectSkillsView configPaths={configPaths} />}
    </div>
  )
}
