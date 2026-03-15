import { createContext, useContext } from 'react'

export type Locale = 'zh' | 'en'

const translations = {
  // Sidebar
  'nav.dashboard': { zh: '总览', en: 'Dashboard' },
  'nav.mcp': { zh: 'MCP 服务', en: 'MCP Services' },
  'nav.skills': { zh: 'Skills', en: 'Skills' },
  'nav.config': { zh: '配置文件', en: 'Config' },

  // Dashboard
  'dashboard.title': { zh: '总览', en: 'Dashboard' },
  'dashboard.subtitle': { zh: '管理所有 AI 命令行工具的 MCP 服务与 Skills 配置', en: 'Manage MCP services and Skills configs for all AI CLI tools' },
  'dashboard.mcp_count': { zh: 'MCP 服务', en: 'MCP Services' },
  'dashboard.skill_count': { zh: 'Skills', en: 'Skills' },
  'dashboard.config_ready': { zh: '配置已就绪', en: 'Config ready' },
  'dashboard.config_missing': { zh: '未检测到配置', en: 'No config found' },
  'dashboard.quick_actions': { zh: '快捷操作', en: 'Quick Actions' },
  'dashboard.manage_mcp': { zh: '管理 MCP 服务', en: 'Manage MCP Services' },
  'dashboard.manage_mcp_desc': { zh: '添加、编辑、删除 MCP 配置', en: 'Add, edit, delete MCP configs' },
  'dashboard.manage_skills': { zh: '管理 Skills', en: 'Manage Skills' },
  'dashboard.manage_skills_desc': { zh: '浏览和管理已安装的 Skills', en: 'Browse and manage installed Skills' },
  'dashboard.edit_config': { zh: '编辑配置文件', en: 'Edit Config Files' },
  'dashboard.edit_config_desc': { zh: '修改 AGENTS.md、CLAUDE.md 等', en: 'Edit AGENTS.md, CLAUDE.md, etc.' },

  // MCP Manager
  'mcp.title': { zh: 'MCP 服务管理', en: 'MCP Service Manager' },
  'mcp.subtitle': { zh: '管理各工具的 Model Context Protocol 服务配置', en: 'Manage Model Context Protocol service configs for each tool' },
  'mcp.tab.projects': { zh: '项目文件夹', en: 'Project Folders' },
  'mcp.projects.desc': { zh: '管理项目级 MCP — 自动读取 {code} 中的项目，也可手动添加文件夹', en: 'Manage project-level MCP — auto-discovers projects from {code}, or add folders manually' },
  'mcp.no_servers': { zh: '暂无 MCP 服务', en: 'No MCP services' },
  'mcp.no_config': { zh: '未检测到 MCP 配置', en: 'No MCP config detected' },
  'mcp.add': { zh: '添加', en: 'Add' },
  'mcp.add_service': { zh: '添加 MCP 服务', en: 'Add MCP Service' },
  'mcp.edit_service': { zh: '编辑 MCP 服务', en: 'Edit MCP Service' },
  'mcp.file_not_exist': { zh: '不存在', en: 'Not found' },
  'mcp.auto_create': { zh: '添加后将自动创建此文件', en: 'File will be created on first add' },
  'mcp.no_projects': { zh: '尚未检测到项目级 MCP 配置', en: 'No project-level MCP configs detected' },
  'mcp.no_projects_hint': { zh: '可手动添加项目文件夹来管理 .mcp.json', en: 'Add project folders manually to manage .mcp.json' },

  // Skills Manager
  'skills.title': { zh: 'Skills 管理', en: 'Skills Manager' },
  'skills.subtitle': { zh: '浏览和管理全局 Skills 及项目级指令文件', en: 'Browse and manage global Skills and project-level instruction files' },
  'skills.tab.projects': { zh: '项目文件夹', en: 'Project Folders' },
  'skills.projects.desc_prefix': { zh: '浏览项目目录下的 Skills（含', en: 'Browse Skills in project directories (with' },
  'skills.projects.desc_suffix': { zh: '的目录）', en: 'directories)' },
  'skills.loading': { zh: '加载中…', en: 'Loading…' },
  'skills.none_installed': { zh: '暂无已安装的 Skills', en: 'No Skills installed' },
  'skills.select_detail': { zh: '选择一个 Skill 查看详情', en: 'Select a Skill to view details' },
  'skills.no_detected': { zh: '未检测到 Skills', en: 'No Skills detected' },
  'skills.system': { zh: '系统', en: 'System' },
  'skills.user': { zh: '用户', en: 'User' },

  // Config Editor
  'config.title': { zh: '配置文件', en: 'Config Files' },
  'config.subtitle': { zh: '编辑全局配置及项目级指令文件', en: 'Edit global configs and project-level instruction files' },
  'config.tab.global': { zh: '全局配置', en: 'Global Config' },
  'config.tab.projects': { zh: '项目文件夹', en: 'Project Folders' },
  'config.no_config_detected': { zh: '未检测到配置文件', en: 'No config files detected' },
  'config.empty_placeholder': { zh: '文件为空，输入内容开始编辑…', en: 'File is empty, start typing to edit…' },

  // Shared
  'common.save': { zh: '保存', en: 'Save' },
  'common.saved': { zh: '已保存', en: 'Saved' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.close': { zh: '关闭', en: 'Close' },
  'common.open': { zh: '打开', en: 'Open' },
  'common.open_file': { zh: '打开文件', en: 'Open File' },
  'common.open_in_finder': { zh: '在 Finder 中打开', en: 'Reveal in Finder' },
  'common.delete': { zh: '删除', en: 'Delete' },
  'common.remove_from_list': { zh: '从列表移除', en: 'Remove from list' },
  'common.add_project_folder': { zh: '添加项目文件夹', en: 'Add Project Folder' },
  'common.no_project_folders': { zh: '尚未检测到项目文件夹', en: 'No project folders detected' },
  'common.no_project_folders_hint': { zh: '可手动添加，或在 MCP 管理中使用 Claude Code 项目后自动发现', en: 'Add manually, or use Claude Code projects in MCP manager to auto-discover' },
  'common.loading': { zh: '加载中…', en: 'Loading…' },
  'common.name': { zh: '名称', en: 'Name' },
  'common.type': { zh: '类型', en: 'Type' },
  'common.env_vars': { zh: '环境变量（每行 KEY=VALUE）', en: 'Env variables (KEY=VALUE per line)' },
  'common.args_per_line': { zh: 'Args（每行一个）', en: 'Args (one per line)' },

  // Delete confirm
  'confirm.delete_skill': { zh: '确定要删除 Skill "{name}" 吗？此操作不可恢复。', en: 'Delete Skill "{name}"? This cannot be undone.' },
  'confirm.delete_mcp': { zh: '确定删除 MCP 服务 "{name}" 吗？', en: 'Delete MCP service "{name}"?' },
  'confirm.unsaved_switch': { zh: '当前文件有未保存的修改，确定切换吗？', en: 'You have unsaved changes. Switch anyway?' },
  'confirm.unsaved_close': { zh: '当前文件有未保存的修改，确定关闭吗？', en: 'You have unsaved changes. Close anyway?' },

  // MCP test
  'mcp.test': { zh: '测试连通性', en: 'Test connection' },
  'mcp.testing': { zh: '测试中…', en: 'Testing…' },
  'mcp.test_ok': { zh: '连通', en: 'Connected' },
  'mcp.test_fail': { zh: '不可用', en: 'Unavailable' },

  // Toast
  'toast.saved': { zh: '已保存', en: 'Saved' },
  'toast.deleted': { zh: '已删除', en: 'Deleted' },
  'toast.save_failed': { zh: '保存失败: {error}', en: 'Save failed: {error}' },
  'toast.delete_failed': { zh: '删除失败: {error}', en: 'Delete failed: {error}' },

  // MCP form
  'mcp.name_exists': { zh: '名称已存在', en: 'Name already exists' },
  'mcp.codex_title': { zh: 'Codex MCP 服务', en: 'Codex MCP Services' },
  'mcp.codex_subtitle': { zh: '~/.codex/config.toml → [mcp_servers]', en: '~/.codex/config.toml → [mcp_servers]' },
  'mcp.cursor_title': { zh: 'Cursor MCP 服务', en: 'Cursor MCP Services' },
  'mcp.cursor_subtitle_exists': { zh: '~/.cursor/mcp.json', en: '~/.cursor/mcp.json' },
  'mcp.cursor_subtitle_missing': { zh: '~/.cursor/mcp.json（文件不存在，添加后自动创建）', en: '~/.cursor/mcp.json (file does not exist, will be created on add)' },
  'mcp.gemini_title': { zh: 'Gemini CLI MCP 服务', en: 'Gemini CLI MCP Services' },
  'mcp.gemini_subtitle_exists': { zh: '~/.gemini/settings.json → mcpServers', en: '~/.gemini/settings.json → mcpServers' },
  'mcp.gemini_subtitle_missing': { zh: '~/.gemini/settings.json（文件不存在，添加后自动创建）', en: '~/.gemini/settings.json (file does not exist, will be created on add)' },
  'mcp.global_mcp': { zh: '全局 MCP', en: 'Global MCP' },
  'mcp.example_name': { zh: '例如: figma', en: 'e.g. figma' },
  'mcp.example_command': { zh: '例如: npx, uvx, node', en: 'e.g. npx, uvx, node' },

  // Config Editor
  'config.projects.desc': { zh: '编辑项目目录下的 CLAUDE.md、AGENTS.md、.cursor/rules/ 等指令配置', en: 'Edit CLAUDE.md, AGENTS.md, .cursor/rules/ and other instruction configs in project directories' },

  // Settings
  'nav.settings': { zh: '设置', en: 'Settings' },
  'settings.title': { zh: '设置', en: 'Settings' },
  'settings.subtitle': { zh: '应用偏好设置', en: 'Application preferences' },
  'settings.language': { zh: '界面语言', en: 'Language' },
  'settings.language_desc': { zh: '选择应用界面显示的语言', en: 'Choose the display language for the app' },
  'settings.theme': { zh: '外观主题', en: 'Appearance' },
  'settings.theme_desc': { zh: '选择应用的外观主题', en: 'Choose the app appearance theme' },
  'settings.theme_light': { zh: '浅色', en: 'Light' },
  'settings.theme_dark': { zh: '深色', en: 'Dark' },
  'settings.theme_system': { zh: '跟随系统', en: 'System' },
  'settings.mcp_auto_test': { zh: '自动测试 MCP 连通性', en: 'Auto-test MCP connectivity' },
  'settings.mcp_auto_test_desc': { zh: '切换到 MCP 标签页时自动检测所有服务的连通状态', en: 'Automatically test all MCP servers when switching to their tab' },
  'settings.about': { zh: '关于', en: 'About' },
  'settings.about_desc': { zh: '统一管理 AI 命令行工具的 MCP 服务与 Skills 配置', en: 'A unified desktop app for managing MCP services and Skills across AI coding tools' },
  'settings.version': { zh: '版本', en: 'Version' },
  'settings.license': { zh: '开源协议', en: 'License' },
  'settings.source_code': { zh: '源代码', en: 'Source Code' },
} satisfies Record<string, Record<Locale, string>>

export type TransKey = keyof typeof translations

const LOCALE_KEY = 'skillava-locale'

export function detectLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_KEY) as Locale | null
  if (saved === 'zh' || saved === 'en') return saved
  const lang = navigator.language || ''
  return lang.startsWith('zh') ? 'zh' : 'en'
}

export function saveLocale(locale: Locale) {
  localStorage.setItem(LOCALE_KEY, locale)
}

export function t(key: TransKey, locale: Locale, vars?: Record<string, string>): string {
  const entry = translations[key]
  let text = entry?.[locale] || entry?.['en'] || key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, v)
    }
  }
  return text
}

export const I18nContext = createContext<{ locale: Locale; t: (key: TransKey, vars?: Record<string, string>) => string }>({
  locale: 'zh',
  t: (key) => key,
})

export function useI18n() {
  return useContext(I18nContext)
}
