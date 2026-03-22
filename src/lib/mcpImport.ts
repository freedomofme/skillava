import { parse as parseToml } from 'smol-toml'
import { McpServer } from '../types'

export interface McpImportResult {
  format: string
  servers: McpServer[]
  warnings: string[]
}

export interface PreparedImportResult {
  servers: McpServer[]
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value)
    .filter(([key, item]) => key.trim() && item !== undefined && item !== null)
    .map(([key, item]) => [key, String(item)] as const)
  return entries.length ? Object.fromEntries(entries) : undefined
}

function normalizeTransport(rawType: unknown, hasUrl: boolean): string {
  if (typeof rawType === 'string') {
    if (rawType === 'remote') return 'http'
    if (rawType === 'stdio' || rawType === 'http' || rawType === 'sse') return rawType
    return rawType
  }
  return hasUrl ? 'http' : 'stdio'
}

function normalizeImportedServer(name: string, config: unknown): McpServer | null {
  if (!isRecord(config)) return null

  const url = typeof config.url === 'string'
    ? config.url
    : typeof config.serverUrl === 'string'
      ? config.serverUrl
      : undefined
  const command = typeof config.command === 'string' ? config.command : undefined
  const args = Array.isArray(config.args) ? config.args.map(String) : undefined
  const env = toStringRecord(config.env)
  const headers = toStringRecord(config.headers) || toStringRecord(config.http_headers)

  if (!url && !command) return null

  return {
    name,
    url,
    command,
    args,
    env,
    headers,
    type: normalizeTransport(config.type, Boolean(url)),
  }
}

function sanitizeServerName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[@/_-]+/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function stripPackageVersion(value: string): string {
  if (!value.startsWith('@')) return value.replace(/@[^/]+$/, '')
  const slashIndex = value.indexOf('/')
  if (slashIndex < 0) return value
  const versionIndex = value.indexOf('@', slashIndex + 1)
  return versionIndex >= 0 ? value.slice(0, versionIndex) : value
}

function guessNameFromPackageSpec(value: string): string {
  const stripped = stripPackageVersion(value)
  return sanitizeServerName(stripped.replace(/^@/, '').replace(/\//g, '-'))
}

function guessNameFromUrl(value: string): string {
  try {
    const url = new URL(value)
    const parts = url.hostname.split('.').filter(Boolean)
    const preferred = parts.find((part) => !['www', 'api', 'mcp'].includes(part)) || parts[0] || 'remote-mcp'
    return sanitizeServerName(preferred) || 'remote-mcp'
  } catch {
    return 'remote-mcp'
  }
}

function guessNameFromCommand(command: string, args: string[]): string {
  const base = sanitizeServerName(command.split('/').pop() || command)
  const packageManagers = new Set(['npx', 'pnpx', 'bunx', 'uvx'])
  if (packageManagers.has(base)) {
    const packageSpec = args.find((arg) => !arg.startsWith('-'))
    if (packageSpec) return guessNameFromPackageSpec(packageSpec)
  }
  if (base === 'pnpm' || base === 'yarn') {
    const startIndex = args[0] === 'dlx' ? 1 : 0
    const packageSpec = args.slice(startIndex).find((arg) => !arg.startsWith('-'))
    if (packageSpec) return guessNameFromPackageSpec(packageSpec)
  }
  return base || 'stdio-mcp'
}

function normalizeCliInput(input: string): string {
  return input
    .replace(/\\\r?\n/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim()
}

function shellSplit(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of input) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\') {
      escaping = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (current) tokens.push(current)
  return tokens
}

function parseHeaderPair(value: string): [string, string] | null {
  const colonIndex = value.indexOf(':')
  if (colonIndex <= 0) return null
  const key = value.slice(0, colonIndex).trim()
  const headerValue = value.slice(colonIndex + 1).trim()
  if (!key || !headerValue) return null
  return [key, headerValue]
}

function parseJsonImport(raw: string): McpImportResult | null {
  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) return null

    const warnings: string[] = []
    let container: Record<string, any> | null = null
    let format = ''

    if (isRecord(parsed.mcpServers)) {
      container = parsed.mcpServers
      format = 'mcpServers JSON'
    } else if (isRecord(parsed.servers)) {
      container = parsed.servers
      format = 'servers JSON'
    } else if (isRecord(parsed.mcp)) {
      container = parsed.mcp
      format = 'mcp JSON'
    }

    if (container) {
      const servers = Object.entries(container)
        .map(([name, config]) => normalizeImportedServer(name, config))
        .filter((server): server is McpServer => Boolean(server))
      if (!servers.length) return null
      return { format, servers, warnings }
    }

    const guessedName = typeof parsed.url === 'string' || typeof parsed.serverUrl === 'string'
      ? guessNameFromUrl(String(parsed.url || parsed.serverUrl))
      : typeof parsed.command === 'string'
        ? guessNameFromCommand(parsed.command, Array.isArray(parsed.args) ? parsed.args.map(String) : [])
        : 'imported-mcp'

    const singleServer = normalizeImportedServer(guessedName, parsed)
    if (!singleServer) return null
    warnings.push(`No server name found. Guessed "${singleServer.name}".`)
    return { format: 'single server JSON', servers: [singleServer], warnings }
  } catch {
    return null
  }
}

function parseCodexTomlImport(raw: string): McpImportResult | null {
  try {
    const parsed = parseToml(raw) as any
    if (!isRecord(parsed?.mcp_servers)) return null

    const servers = Object.entries(parsed.mcp_servers)
      .map(([name, config]) => normalizeImportedServer(name, {
        ...(isRecord(config) ? config : {}),
        headers: isRecord(config) ? config.http_headers : undefined,
      }))
      .filter((server): server is McpServer => Boolean(server))

    if (!servers.length) return null
    return { format: 'Codex TOML', servers, warnings: [] }
  } catch {
    return null
  }
}

function parseClaudeAddJson(raw: string): McpImportResult | null {
  const tokens = shellSplit(normalizeCliInput(raw))
  if (tokens.length < 5 || tokens[0] !== 'claude' || tokens[1] !== 'mcp' || tokens[2] !== 'add-json') return null

  try {
    const name = tokens[3]
    const config = JSON.parse(tokens.slice(4).join(' '))
    const server = normalizeImportedServer(name, config)
    if (!server) return null
    return { format: 'Claude CLI add-json', servers: [server], warnings: [] }
  } catch {
    return null
  }
}

function parseClaudeAdd(raw: string): McpImportResult | null {
  const tokens = shellSplit(normalizeCliInput(raw))
  if (tokens.length < 4 || tokens[0] !== 'claude' || tokens[1] !== 'mcp' || tokens[2] !== 'add') return null

  const name = tokens[3]
  const server: McpServer = { name, type: 'stdio' }
  const warnings: string[] = []

  for (let index = 4; index < tokens.length; index += 1) {
    const token = tokens[index]

    if (token === '--') {
      server.command = tokens[index + 1]
      server.args = tokens.slice(index + 2)
      server.type = 'stdio'
      break
    }
    if (token === '--transport') {
      server.type = tokens[index + 1] || server.type
      index += 1
      continue
    }
    if (token === '--url') {
      server.url = tokens[index + 1]
      if (!server.type || server.type === 'stdio') server.type = 'http'
      index += 1
      continue
    }
    if (token === '--header') {
      const parsed = parseHeaderPair(tokens[index + 1] || '')
      if (parsed) {
        server.headers = { ...(server.headers || {}), [parsed[0]]: parsed[1] }
      }
      index += 1
      continue
    }
    if (token === '--env') {
      const envPair = tokens[index + 1] || ''
      const separatorIndex = envPair.indexOf('=')
      if (separatorIndex > 0) {
        server.env = {
          ...(server.env || {}),
          [envPair.slice(0, separatorIndex)]: envPair.slice(separatorIndex + 1),
        }
      }
      index += 1
      continue
    }
    if (token.startsWith('--header=')) {
      const parsed = parseHeaderPair(token.slice('--header='.length))
      if (parsed) {
        server.headers = { ...(server.headers || {}), [parsed[0]]: parsed[1] }
      }
      continue
    }
    if (token.startsWith('--url=')) {
      server.url = token.slice('--url='.length)
      if (!server.type || server.type === 'stdio') server.type = 'http'
      continue
    }
    if (token.startsWith('--transport=')) {
      server.type = token.slice('--transport='.length) || server.type
      continue
    }
  }

  if (!server.url && !server.command) {
    warnings.push('Claude CLI command did not contain a URL or executable command.')
    return { format: 'Claude CLI add', servers: [], warnings }
  }

  return { format: 'Claude CLI add', servers: [server], warnings }
}

function parseGeminiExtension(raw: string): McpImportResult | null {
  const tokens = shellSplit(normalizeCliInput(raw))
  if (tokens.length < 4 || tokens[0] !== 'gemini' || tokens[1] !== 'extensions' || tokens[2] !== 'install') return null
  return {
    format: 'Gemini extension install',
    servers: [],
    warnings: [
      'Gemini extension install points to an extension repository, not a raw MCP server config. v1 import does not resolve Gemini extensions automatically.',
    ],
  }
}

function parseSingleUrl(raw: string): McpImportResult | null {
  const value = raw.trim()
  if (!/^https?:\/\/\S+$/i.test(value)) return null
  const name = guessNameFromUrl(value)
  return {
    format: 'Single URL',
    servers: [{ name, url: value, type: 'http' }],
    warnings: [`No server name found. Guessed "${name}".`],
  }
}

function parseShellCommand(raw: string): McpImportResult | null {
  const tokens = shellSplit(normalizeCliInput(raw))
  if (!tokens.length) return null

  const command = tokens[0]
  const args = tokens.slice(1)
  const name = guessNameFromCommand(command, args)

  return {
    format: 'Shell command',
    servers: [{ name, command, args, type: 'stdio' }],
    warnings: [`No server name found. Guessed "${name}".`],
  }
}

export function parseMcpImportInput(raw: string): McpImportResult | null {
  const input = raw.trim()
  if (!input) return null

  return (
    parseGeminiExtension(input) ||
    parseClaudeAddJson(input) ||
    parseClaudeAdd(input) ||
    parseJsonImport(input) ||
    parseCodexTomlImport(input) ||
    parseSingleUrl(input) ||
    parseShellCommand(input)
  )
}

export function prepareImportedServers(servers: McpServer[], existingNames: string[]): PreparedImportResult {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()).filter(Boolean))
  const warnings: string[] = []

  const prepared = servers.map((server, index) => {
    const baseName = server.name?.trim() || `imported-mcp-${index + 1}`
    let name = baseName
    let counter = 2

    while (taken.has(name.toLowerCase())) {
      name = `${baseName}-${counter}`
      counter += 1
    }

    if (name !== baseName) {
      warnings.push(`Renamed "${baseName}" to "${name}" because that name already exists in this target.`)
    }

    taken.add(name.toLowerCase())
    return { ...server, name }
  })

  return { servers: prepared, warnings }
}
