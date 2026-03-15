import { useState, useEffect, useMemo, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import McpManager from './pages/McpManager'
import SkillsManager from './pages/SkillsManager'
import ConfigEditor from './pages/ConfigEditor'
import Settings from './pages/Settings'
import { ConfigPaths } from './types'
import { I18nContext, Locale, detectLocale, saveLocale, t } from './lib/i18n'
import { ToastProvider } from './lib/toast'
import { Theme, loadSettings, saveSettings, applyTheme } from './lib/settings'

type Page = 'dashboard' | 'mcp' | 'skills' | 'config' | 'settings'

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [configPaths, setConfigPaths] = useState<ConfigPaths | null>(null)
  const [locale, setLocale] = useState<Locale>(detectLocale)
  const [theme, setTheme] = useState<Theme>(() => loadSettings().theme)

  useEffect(() => {
    window.electronAPI.getConfigPaths().then(setConfigPaths)
  }, [])

  useEffect(() => {
    applyTheme(theme)
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  const handleThemeChange = useCallback((t: Theme) => {
    setTheme(t)
    saveSettings({ theme: t })
  }, [])

  function handleLocaleChange(l: Locale) {
    setLocale(l)
    saveLocale(l)
  }

  const i18nValue = useMemo(() => ({
    locale,
    t: (key: Parameters<typeof t>[0], vars?: Record<string, string>) => t(key, locale, vars),
  }), [locale])

  return (
    <I18nContext.Provider value={i18nValue}>
      <ToastProvider>
        <div className="flex h-screen bg-surface-0 text-text-primary">
          <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />

          <main className="flex-1 overflow-auto">
            <div className="drag-region h-14 sticky top-0 z-10 bg-surface-0/80 backdrop-blur-sm" />

            <div className="-mt-4">
              {currentPage === 'dashboard' && (
                <Dashboard configPaths={configPaths} onNavigate={setCurrentPage} />
              )}
              {currentPage === 'mcp' && (
                <McpManager configPaths={configPaths} />
              )}
              {currentPage === 'skills' && (
                <SkillsManager configPaths={configPaths} />
              )}
              {currentPage === 'config' && (
                <ConfigEditor configPaths={configPaths} />
              )}
              {currentPage === 'settings' && (
                <Settings locale={locale} onLocaleChange={handleLocaleChange} theme={theme} onThemeChange={handleThemeChange} />
              )}
            </div>
          </main>
        </div>
      </ToastProvider>
    </I18nContext.Provider>
  )
}
