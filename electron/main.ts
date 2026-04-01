import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'

const HOME = os.homedir()
const COMMON_BIN_DIRS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
]

const CONFIG_PATHS = {
  codex: {
    config: path.join(HOME, '.codex', 'config.toml'),
    agents: path.join(HOME, '.codex', 'AGENTS.md'),
    skillsDir: path.join(HOME, '.codex', 'skills'),
  },
  claude: {
    state: path.join(HOME, '.claude.json'),
    settings: path.join(HOME, '.claude', 'settings.json'),
    settingsLocal: path.join(HOME, '.claude', 'settings.local.json'),
    instructions: path.join(HOME, '.claude', 'CLAUDE.md'),
    skillsDir: path.join(HOME, '.claude', 'skills'),
  },
  cursor: {
    mcp: path.join(HOME, '.cursor', 'mcp.json'),
    skillsDir: path.join(HOME, '.cursor', 'skills'),
    managedSkillsDir: path.join(HOME, '.cursor', 'skills-cursor'),
    rulesDir: path.join(HOME, '.cursor', 'rules'),
  },
  gemini: {
    settings: path.join(HOME, '.gemini', 'settings.json'),
    skillsDir: path.join(HOME, '.gemini', 'skills'),
  },
}

// ── Security: path allow-list ──

const ALLOWED_PREFIXES = [
  path.join(HOME, '.codex'),
  path.join(HOME, '.claude'),
  path.join(HOME, '.cursor'),
  path.join(HOME, '.gemini'),
  path.join(HOME, '.claude.json'),
]

// User-added project folders are tracked at runtime so they're also allowed
const allowedProjectDirs = new Set<string>()

function isPathAllowed(targetPath: string): boolean {
  const resolved = path.resolve(targetPath)
  if (ALLOWED_PREFIXES.some((prefix) => resolved === prefix || resolved.startsWith(prefix + path.sep))) {
    return true
  }
  for (const dir of allowedProjectDirs) {
    if (resolved === dir || resolved.startsWith(dir + path.sep)) return true
  }
  return false
}

function assertPathAllowed(targetPath: string) {
  if (!isPathAllowed(targetPath)) {
    throw new Error(`Access denied: ${targetPath}`)
  }
}

// ── Window ──

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#09090b',
    icon: path.join(__dirname, '..', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── File system helpers ──

function readFileSync(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function writeFileSync(filePath: string, content: string) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

function listDirSync(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath)
  } catch {
    return []
  }
}

function getSkillDescription(skillMd: string | null): string {
  return skillMd?.split('\n').find((l: string) => l.trim() && !l.startsWith('#'))?.trim() || ''
}

function buildSpawnEnv(extraEnv: Record<string, string>) {
  const currentPath = extraEnv.PATH || process.env.PATH || ''
  const mergedPath = [...new Set([...currentPath.split(path.delimiter).filter(Boolean), ...COMMON_BIN_DIRS])]
    .join(path.delimiter)
  return {
    ...process.env,
    ...extraEnv,
    PATH: mergedPath,
  }
}

function resolveCommandPath(command: string, env: Record<string, string>): string | null {
  if (!command) return null
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return fs.existsSync(command) ? command : null
  }

  const pathDirs = (env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)

  for (const dir of pathDirs) {
    const candidate = path.join(dir, command)
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

// ── IPC Handlers ──

const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')).version as string
const GITHUB_REPO = 'freedomofme/skillava'

ipcMain.handle('get-app-version', () => APP_VERSION)

ipcMain.handle('check-for-update', async () => {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'SkillAva' },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return { hasUpdate: false, error: `GitHub API ${res.status}` }
    const data = await res.json()
    const latest = (data.tag_name || '').replace(/^v/, '')
    const current = APP_VERSION
    const hasUpdate = latest !== current && latest > current
    return {
      hasUpdate,
      currentVersion: current,
      latestVersion: latest,
      releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
      releaseNotes: data.body || '',
    }
  } catch (err: any) {
    return { hasUpdate: false, error: err.message || 'Network error' }
  }
})

ipcMain.handle('get-config-paths', () => CONFIG_PATHS)

ipcMain.handle('read-file', (_e, filePath: string) => {
  assertPathAllowed(filePath)
  return readFileSync(filePath)
})

ipcMain.handle('write-file', (_e, filePath: string, content: string) => {
  assertPathAllowed(filePath)
  try {
    writeFileSync(filePath, content)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('list-dir', (_e, dirPath: string) => {
  assertPathAllowed(dirPath)
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      path: path.join(dirPath, e.name),
    }))
  } catch {
    return []
  }
})

ipcMain.handle('file-exists', (_e, filePath: string) => {
  assertPathAllowed(filePath)
  return fs.existsSync(filePath)
})

ipcMain.handle('read-skill', (_e, skillDir: string) => {
  assertPathAllowed(skillDir)
  const skillMd = path.join(skillDir, 'SKILL.md')
  const content = readFileSync(skillMd)
  const agentsDir = path.join(skillDir, 'agents')
  const refsDir = path.join(skillDir, 'references')
  return {
    name: path.basename(skillDir),
    path: skillDir,
    content,
    hasAgents: fs.existsSync(agentsDir),
    hasReferences: fs.existsSync(refsDir),
    agents: listDirSync(agentsDir),
    references: listDirSync(refsDir),
  }
})

ipcMain.handle('list-skills', (_e, skillsRootDir: string) => {
  assertPathAllowed(skillsRootDir)
  function isDir(entry: fs.Dirent, parentDir: string): boolean {
    if (entry.isDirectory()) return true
    if (entry.isSymbolicLink()) {
      try {
        return fs.statSync(path.join(parentDir, entry.name)).isDirectory()
      } catch { return false }
    }
    return false
  }
  try {
    const entries = fs.readdirSync(skillsRootDir, { withFileTypes: true })
    const skills: { name: string; path: string; isSystem: boolean; description: string }[] = []
    for (const entry of entries) {
      if (!isDir(entry, skillsRootDir)) continue
      const fullPath = path.join(skillsRootDir, entry.name)
      if (entry.name === '.system') {
        for (const se of fs.readdirSync(fullPath, { withFileTypes: true })) {
          if (!isDir(se, fullPath)) continue
          const sp = path.join(fullPath, se.name)
          skills.push({ name: se.name, path: sp, isSystem: true, description: getSkillDescription(readFileSync(path.join(sp, 'SKILL.md'))) })
        }
      } else {
        skills.push({ name: entry.name, path: fullPath, isSystem: false, description: getSkillDescription(readFileSync(path.join(fullPath, 'SKILL.md'))) })
      }
    }
    return skills
  } catch {
    return []
  }
})

ipcMain.handle('open-in-finder', (_e, filePath: string) => {
  assertPathAllowed(filePath)
  shell.showItemInFolder(filePath)
})

ipcMain.handle('open-external', (_e, url: string) => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Blocked URL scheme: ${parsed.protocol}`)
  }
  shell.openExternal(url)
})

ipcMain.handle('delete-dir', (_e, dirPath: string) => {
  assertPathAllowed(dirPath)
  const resolved = path.resolve(dirPath)
  if (resolved === HOME || resolved === '/' || resolved.split(path.sep).length <= 2) {
    throw new Error(`Refusing to delete critical path: ${resolved}`)
  }
  try {
    fs.rmSync(dirPath, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
})

// ── Folder picker ──

ipcMain.handle('select-folder', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Select Project Folder',
  })
  if (result.canceled || !result.filePaths.length) return null
  const selected = result.filePaths[0]
  allowedProjectDirs.add(selected)
  return selected
})

// ── MCP connectivity test ──

const MCP_INIT_REQUEST = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'Skill Ava', version: '0.1.0' },
  },
})

function testMcpCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<{ ok: boolean; message: string; serverName?: string }> {
  return new Promise((resolve) => {
    let child: ChildProcess
    const spawnEnv = buildSpawnEnv(env)
    const resolvedCommand = resolveCommandPath(command, spawnEnv)
    if (!resolvedCommand) {
      resolve({
        ok: false,
        message: `Command not found: ${command}. PATH=${spawnEnv.PATH}`,
      })
      return
    }
    try {
      child = spawn(resolvedCommand, args, {
        env: spawnEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err: any) {
      resolve({ ok: false, message: err.message })
      return
    }

    const timeout = setTimeout(() => {
      child.kill()
      resolve({ ok: false, message: 'Timeout (15s) — process started but no MCP response' })
    }, 15000)

    let stdout = ''
    let stderr = ''
    let resolved = false

    function finish(result: { ok: boolean; message: string; serverName?: string }) {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      child.kill()
      resolve(result)
    }

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const msg = JSON.parse(trimmed)
          if (msg.result?.serverInfo || msg.result?.protocolVersion) {
            const name = msg.result.serverInfo?.name
            const ver = msg.result.serverInfo?.version
            const label = name ? (ver ? `${name} v${ver}` : name) : 'OK'
            finish({ ok: true, message: label, serverName: name })
            return
          }
        } catch {}
      }
    })

    child.stderr?.on('data', (data) => { stderr += data.toString() })

    child.on('error', (err) => {
      finish({ ok: false, message: err.message })
    })

    child.on('close', (code) => {
      if (!resolved) {
        const hint = stderr.trim().split('\n')[0]?.slice(0, 150) || `Exit code ${code}`
        finish({ ok: false, message: hint })
      }
    })

    child.stdin?.write(MCP_INIT_REQUEST + '\n')
  })
}

function resolveHeaderValue(value: string): string {
  return value.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}|\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, varA, varB) => {
    const envName = varA || varB
    return process.env[envName] ?? match
  })
}

function buildRequestHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key, value]) => key.trim() && value !== undefined && value !== null)
      .map(([key, value]) => [key, resolveHeaderValue(String(value))]),
  )
}

async function testMcpUrl(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ ok: boolean; message: string; serverName?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const requestHeaders = buildRequestHeaders(headers)
    // Try POST (Streamable HTTP / standard MCP-over-HTTP)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...requestHeaders,
      },
      body: MCP_INIT_REQUEST,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (res.ok) {
      const text = await res.text()
      try {
        const msg = JSON.parse(text)
        if (msg.result?.serverInfo || msg.result?.protocolVersion) {
          const name = msg.result.serverInfo?.name
          const ver = msg.result.serverInfo?.version
          return { ok: true, message: name ? (ver ? `${name} v${ver}` : name) : 'Connected', serverName: name }
        }
      } catch {}
      return { ok: true, message: `Reachable (HTTP ${res.status})` }
    }

    // 405 = might be SSE-only, try GET
    if (res.status === 405 || res.status === 404) {
      const ctrl2 = new AbortController()
      const t2 = setTimeout(() => ctrl2.abort(), 5000)
      try {
        const getRes = await fetch(url, { method: 'GET', headers: requestHeaders, signal: ctrl2.signal })
        clearTimeout(t2)
        if (getRes.ok) return { ok: true, message: 'Reachable (SSE endpoint)' }
      } catch {} finally { clearTimeout(t2) }
    }

    return { ok: false, message: `HTTP ${res.status} ${res.statusText}` }
  } catch (err: any) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') return { ok: false, message: 'Timeout (10s)' }
    return { ok: false, message: err.message || 'Connection failed' }
  }
}

ipcMain.handle('test-mcp-server', async (_e, server: {
  command?: string; args?: string[]; url?: string; env?: Record<string, string>; headers?: Record<string, string>
}) => {
  if (server.url) {
    return testMcpUrl(server.url, server.headers || {})
  }
  if (server.command) {
    return testMcpCommand(server.command, server.args || [], server.env || {})
  }
  return { ok: false, message: 'No command or URL configured' }
})

// ── Probe a project folder ──

ipcMain.handle('probe-project-mcp', (_e, projectDir: string) => {
  // Auto-allow probed project dirs (they come from ~/.claude.json discovery or user selection)
  allowedProjectDirs.add(projectDir)

  const mcpJsonPath = path.join(projectDir, '.mcp.json')
  const cursorMcpPath = path.join(projectDir, '.cursor', 'mcp.json')
  const claudeSettingsPath = path.join(projectDir, '.claude', 'settings.json')

  const files: { path: string; label: string; content: string | null }[] = []
  if (fs.existsSync(mcpJsonPath))
    files.push({ path: mcpJsonPath, label: '.mcp.json', content: readFileSync(mcpJsonPath) })
  if (fs.existsSync(cursorMcpPath))
    files.push({ path: cursorMcpPath, label: '.cursor/mcp.json', content: readFileSync(cursorMcpPath) })
  if (fs.existsSync(claudeSettingsPath))
    files.push({ path: claudeSettingsPath, label: '.claude/settings.json', content: readFileSync(claudeSettingsPath) })

  const claudeMdPath = path.join(projectDir, 'CLAUDE.md')
  const agentsMdPath = path.join(projectDir, 'AGENTS.md')
  const cursorRulesDir = path.join(projectDir, '.cursor', 'rules')
  const cursorRulesFile = path.join(projectDir, '.cursorrules')

  const configs: { path: string; label: string; tool: string; content: string | null; isDir: boolean }[] = []
  if (fs.existsSync(claudeMdPath))
    configs.push({ path: claudeMdPath, label: 'CLAUDE.md', tool: 'Claude Code', content: readFileSync(claudeMdPath), isDir: false })
  if (fs.existsSync(agentsMdPath))
    configs.push({ path: agentsMdPath, label: 'AGENTS.md', tool: 'Codex', content: readFileSync(agentsMdPath), isDir: false })
  if (fs.existsSync(cursorRulesDir)) {
    const ruleFiles = listDirSync(cursorRulesDir).filter((f: string) => !f.startsWith('.'))
    configs.push({ path: cursorRulesDir, label: `.cursor/rules/ (${ruleFiles.length} files)`, tool: 'Cursor', content: ruleFiles.join('\n'), isDir: true })
  }
  if (fs.existsSync(cursorRulesFile))
    configs.push({ path: cursorRulesFile, label: '.cursorrules', tool: 'Cursor', content: readFileSync(cursorRulesFile), isDir: false })

  const skills: { name: string; path: string; tool: string; description: string }[] = []
  const codexSkillsDir = path.join(projectDir, '.codex', 'skills')
  const cursorSkillsDir = path.join(projectDir, '.cursor', 'skills')

  for (const [dir, tool] of [[codexSkillsDir, 'Codex'], [cursorSkillsDir, 'Cursor']] as const) {
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const skillPath = path.join(dir, entry.name)
      const skillMd = readFileSync(path.join(skillPath, 'SKILL.md'))
      if (skillMd !== null) {
        skills.push({ name: entry.name, path: skillPath, tool, description: getSkillDescription(skillMd) })
      }
    }
  }

  return { projectDir, projectName: path.basename(projectDir), files, configs, skills, mcpJsonPath, cursorMcpPath, claudeSettingsPath }
})
