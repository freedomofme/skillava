import { useState, useEffect } from 'react'
import { Globe, Info, Zap, Sun, Moon, Monitor, RefreshCw, Download, CheckCircle, AlertCircle } from 'lucide-react'
import { Locale } from '../lib/i18n'
import { useI18n } from '../lib/i18n'
import { Theme, loadSettings, saveSettings } from '../lib/settings'
import { UpdateInfo } from '../types'

interface SettingsProps {
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

const LANGUAGES: { value: Locale; label: string; flag: string }[] = [
  { value: 'zh', label: '中文', flag: '🇨🇳' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
]

export default function Settings({ locale, onLocaleChange, theme, onThemeChange }: SettingsProps) {
  const { t } = useI18n()
  const [autoTestMcp, setAutoTestMcp] = useState(() => loadSettings().autoTestMcp)
  const [appVersion, setAppVersion] = useState('…')
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'done'>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setAppVersion)
  }, [])

  async function handleCheckUpdate() {
    setUpdateState('checking')
    setUpdateInfo(null)
    const info = await window.electronAPI.checkForUpdate()
    setUpdateInfo(info)
    setUpdateState('done')
  }

  function toggleAutoTest() {
    const next = !autoTestMcp
    setAutoTestMcp(next)
    saveSettings({ autoTestMcp: next })
  }

  const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: t('settings.theme_light'), icon: <Sun size={15} /> },
    { value: 'dark', label: t('settings.theme_dark'), icon: <Moon size={15} /> },
    { value: 'system', label: t('settings.theme_system'), icon: <Monitor size={15} /> },
  ]

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t('settings.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* Theme */}
      <div className="glass overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/[0.04]">
          <Sun size={18} className="text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('settings.theme')}</h3>
            <p className="text-xs text-text-muted mt-0.5">{t('settings.theme_desc')}</p>
          </div>
        </div>
        <div className="px-5 py-4 flex gap-3">
          {THEMES.map((item) => (
            <button
              key={item.value}
              onClick={() => onThemeChange(item.value)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                theme === item.value
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-surface-3/50 text-text-secondary hover:bg-surface-3 hover:text-text-primary border border-transparent'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* MCP Auto Test */}
      <div className="glass overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4">
          <Zap size={18} className="text-accent flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-text-primary">{t('settings.mcp_auto_test')}</h3>
            <p className="text-xs text-text-muted mt-0.5">{t('settings.mcp_auto_test_desc')}</p>
          </div>
          <button
            onClick={toggleAutoTest}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
              autoTestMcp ? 'bg-accent' : 'bg-surface-4'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              autoTestMcp ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </div>

      {/* Language */}
      <div className="glass overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/[0.04]">
          <Globe size={18} className="text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('settings.language')}</h3>
            <p className="text-xs text-text-muted mt-0.5">{t('settings.language_desc')}</p>
          </div>
        </div>
        <div className="px-5 py-4 flex gap-3">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.value}
              onClick={() => onLocaleChange(lang.value)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                locale === lang.value
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-surface-3/50 text-text-secondary hover:bg-surface-3 hover:text-text-primary border border-transparent'
              }`}
            >
              <span className="text-base">{lang.flag}</span>
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* About */}
      <div className="glass overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/[0.04]">
          <Info size={18} className="text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('settings.about')}</h3>
            <p className="text-xs text-text-muted mt-0.5">{t('settings.about_desc')}</p>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">{t('settings.version')}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-primary font-mono">{appVersion}</span>
              <button
                onClick={handleCheckUpdate}
                disabled={updateState === 'checking'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all bg-surface-3/50 text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:opacity-50"
              >
                <RefreshCw size={12} className={updateState === 'checking' ? 'animate-spin' : ''} />
                {updateState === 'checking' ? t('settings.checking') : t('settings.check_update')}
              </button>
            </div>
          </div>
          {updateInfo && (
            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
              updateInfo.error ? 'bg-red-500/10' : updateInfo.hasUpdate ? 'bg-accent/10' : 'bg-emerald-500/10'
            }`}>
              <div className="flex items-center gap-2">
                {updateInfo.error ? (
                  <AlertCircle size={14} className="text-red-400" />
                ) : updateInfo.hasUpdate ? (
                  <Download size={14} className="text-accent" />
                ) : (
                  <CheckCircle size={14} className="text-emerald-400" />
                )}
                <span className="text-sm">
                  {updateInfo.error
                    ? t('settings.update_error', { error: updateInfo.error })
                    : updateInfo.hasUpdate
                      ? t('settings.update_available', { version: updateInfo.latestVersion || '' })
                      : t('settings.up_to_date')}
                </span>
              </div>
              {updateInfo.hasUpdate && updateInfo.releaseUrl && (
                <button
                  onClick={() => window.electronAPI.openExternal(updateInfo.releaseUrl!)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
                >
                  <Download size={12} />
                  {t('settings.download_update')}
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">{t('settings.license')}</span>
            <span className="text-sm text-text-primary">Apache 2.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">{t('settings.source_code')}</span>
            <button
              onClick={() => window.electronAPI.openExternal('https://github.com/freedomofme/skillava')}
              className="text-sm text-accent hover:underline"
            >
              GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
