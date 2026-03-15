const STORAGE_KEY = 'skillava-settings'

export type Theme = 'light' | 'dark' | 'system'

export interface AppSettings {
  autoTestMcp: boolean
  theme: Theme
}

const DEFAULTS: AppSettings = {
  autoTestMcp: true,
  theme: 'dark',
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Partial<AppSettings>) {
  const current = loadSettings()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...settings }))
}

export function getResolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  const resolved = getResolvedTheme(theme)
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)
}
