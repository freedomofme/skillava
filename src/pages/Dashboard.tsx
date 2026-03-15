import { useEffect, useState, useCallback } from 'react'
import { Server, Sparkles, FileText } from 'lucide-react'
import { ConfigPaths } from '../types'
import { parseCodexMcpServers, getAllClaudeMcpCount, parseGeminiMcpServers } from '../lib/parsers'
import { useI18n } from '../lib/i18n'

interface DashboardProps {
  configPaths: ConfigPaths | null
  onNavigate: (page: 'mcp' | 'skills' | 'config') => void
}

interface ToolStatus {
  name: string
  tag: string
  color: string
  mcpCount: number
  skillCount: number
  configExists: boolean
}

export default function Dashboard({ configPaths, onNavigate }: DashboardProps) {
  const { t } = useI18n()
  const [tools, setTools] = useState<ToolStatus[]>([])
  const [loading, setLoading] = useState(true)

  const loadStatus = useCallback(async () => {
    if (!configPaths) return
    setLoading(true)
    const results: ToolStatus[] = []

    const codexConfig = await window.electronAPI.readFile(configPaths.codex.config)
    const codexMcp = codexConfig ? parseCodexMcpServers(codexConfig) : []
    const codexSkills = await window.electronAPI.listSkills(configPaths.codex.skillsDir)
    results.push({
      name: 'OpenAI Codex', tag: 'codex', color: '#10b981',
      mcpCount: codexMcp.length, skillCount: codexSkills.length, configExists: !!codexConfig,
    })

    const claudeState = await window.electronAPI.readFile(configPaths.claude.state)
    const claudeSettings = await window.electronAPI.readFile(configPaths.claude.settings)
    const claudeInstructions = await window.electronAPI.readFile(configPaths.claude.instructions)
    const claudeMcpCount = getAllClaudeMcpCount(claudeState, claudeSettings)
    const claudeSkills = await window.electronAPI.listSkills(configPaths.claude.skillsDir)
    results.push({
      name: 'Claude Code', tag: 'claude', color: '#f59e0b',
      mcpCount: claudeMcpCount, skillCount: claudeSkills.length,
      configExists: !!claudeState || !!claudeSettings || !!claudeInstructions,
    })

    const cursorMcpContent = await window.electronAPI.readFile(configPaths.cursor.mcp)
    let cursorMcpCount = 0
    if (cursorMcpContent) {
      try { cursorMcpCount = Object.keys(JSON.parse(cursorMcpContent).mcpServers || {}).length } catch {}
    }
    const cursorSkills = await window.electronAPI.listSkills(configPaths.cursor.skillsDir)
    results.push({
      name: 'Cursor', tag: 'cursor', color: '#6366f1',
      mcpCount: cursorMcpCount, skillCount: cursorSkills.length,
      configExists: !!cursorMcpContent || cursorSkills.length > 0,
    })

    const geminiSettings = await window.electronAPI.readFile(configPaths.gemini.settings)
    const geminiMcp = geminiSettings ? parseGeminiMcpServers(geminiSettings) : []
    const geminiSkills = await window.electronAPI.listSkills(configPaths.gemini.skillsDir)
    results.push({
      name: 'Gemini CLI', tag: 'gemini', color: '#4285f4',
      mcpCount: geminiMcp.length, skillCount: geminiSkills.length,
      configExists: !!geminiSettings,
    })

    setTools(results)
    setLoading(false)
  }, [configPaths])

  useEffect(() => { loadStatus() }, [loadStatus])

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t('dashboard.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('dashboard.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading && tools.length === 0 && [1, 2, 3, 4].map((i) => (
          <div key={i} className="glass p-5 space-y-4 animate-pulse">
            <div className="h-5 bg-surface-3 rounded w-24" />
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-3/50 rounded-lg p-3 h-16" />
              <div className="bg-surface-3/50 rounded-lg p-3 h-16" />
            </div>
            <div className="h-3 bg-surface-3 rounded w-20" />
          </div>
        ))}
        {tools.map((tool) => (
          <div key={tool.tag} className="glass p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tool.color }} />
              <h3 className="font-semibold text-text-primary">{tool.name}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-3/50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-text-primary">{tool.mcpCount}</div>
                <div className="text-xs text-text-muted mt-0.5">{t('dashboard.mcp_count')}</div>
              </div>
              <div className="bg-surface-3/50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-text-primary">{tool.skillCount}</div>
                <div className="text-xs text-text-muted mt-0.5">{t('dashboard.skill_count')}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${tool.configExists ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              <span className="text-xs text-text-secondary">
                {tool.configExists ? t('dashboard.config_ready') : t('dashboard.config_missing')}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3">{t('dashboard.quick_actions')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl">
          <button onClick={() => onNavigate('mcp')} className="glass glass-hover p-4 flex items-center gap-3 text-left">
            <Server size={20} className="text-accent" />
            <div>
              <div className="text-sm font-medium text-text-primary">{t('dashboard.manage_mcp')}</div>
              <div className="text-xs text-text-muted">{t('dashboard.manage_mcp_desc')}</div>
            </div>
          </button>
          <button onClick={() => onNavigate('skills')} className="glass glass-hover p-4 flex items-center gap-3 text-left">
            <Sparkles size={20} className="text-accent" />
            <div>
              <div className="text-sm font-medium text-text-primary">{t('dashboard.manage_skills')}</div>
              <div className="text-xs text-text-muted">{t('dashboard.manage_skills_desc')}</div>
            </div>
          </button>
          <button onClick={() => onNavigate('config')} className="glass glass-hover p-4 flex items-center gap-3 text-left">
            <FileText size={20} className="text-accent" />
            <div>
              <div className="text-sm font-medium text-text-primary">{t('dashboard.edit_config')}</div>
              <div className="text-xs text-text-muted">{t('dashboard.edit_config_desc')}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
