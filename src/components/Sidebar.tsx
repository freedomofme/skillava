import { LayoutDashboard, Server, Sparkles, FileText, ChevronRight, Settings } from 'lucide-react'
import { useI18n } from '../lib/i18n'

type Page = 'dashboard' | 'mcp' | 'skills' | 'config' | 'settings'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { t } = useI18n()

  const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: <LayoutDashboard size={18} /> },
    { id: 'mcp', label: t('nav.mcp'), icon: <Server size={18} /> },
    { id: 'skills', label: t('nav.skills'), icon: <Sparkles size={18} /> },
    { id: 'config', label: t('nav.config'), icon: <FileText size={18} /> },
  ]

  const settingsActive = currentPage === 'settings'

  return (
    <aside className="w-56 h-full flex flex-col bg-surface-1 border-r border-border/[0.06]">
      <div className="drag-region h-14 flex-shrink-0" />
      <div className="px-4 pb-2">
        <span className="no-drag text-sm font-semibold text-text-secondary tracking-wide">
          Skill Ava
        </span>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`
                no-drag w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                transition-all duration-150
                ${active
                  ? 'bg-accent/15 text-accent-hover font-medium'
                  : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary'
                }
              `}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {active && <ChevronRight size={14} className="opacity-50" />}
            </button>
          )
        })}
      </nav>

      <div className="px-2 py-3 border-t border-border/[0.04]">
        <button
          onClick={() => onNavigate('settings')}
          className={`
            no-drag w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
            transition-all duration-150
            ${settingsActive
              ? 'bg-accent/15 text-accent-hover font-medium'
              : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary'
            }
          `}
        >
          <Settings size={18} />
          <span className="flex-1 text-left">{t('nav.settings')}</span>
          {settingsActive && <ChevronRight size={14} className="opacity-50" />}
        </button>
      </div>
    </aside>
  )
}
