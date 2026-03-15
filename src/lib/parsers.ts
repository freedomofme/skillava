import { McpServer, McpGroup } from '../types'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

// ── Codex config.toml parsing ──

export function parseCodexMcpServers(tomlContent: string): McpServer[] {
  try {
    const parsed = parseToml(tomlContent) as any
    const mcpServers = parsed.mcp_servers || {}
    return Object.entries(mcpServers).map(([name, config]: [string, any]) => ({
      name,
      command: config.command,
      args: config.args,
      url: config.url,
      env: config.env,
    }))
  } catch {
    return []
  }
}

export function updateCodexMcpServers(tomlContent: string, servers: McpServer[]): string {
  try {
    const parsed = parseToml(tomlContent) as any
    const mcpServers: Record<string, any> = {}
    for (const server of servers) {
      const entry: any = {}
      if (server.url) entry.url = server.url
      if (server.command) entry.command = server.command
      if (server.args?.length) entry.args = server.args
      if (server.env && Object.keys(server.env).length) entry.env = server.env
      mcpServers[server.name] = entry
    }
    parsed.mcp_servers = mcpServers
    return stringifyToml(parsed)
  } catch {
    return tomlContent
  }
}

// ── Claude ~/.claude/settings.json parsing (user-editable) ──

export function parseClaudeSettingsMcp(jsonContent: string): McpServer[] {
  try {
    const parsed = JSON.parse(jsonContent)
    const mcpServers = parsed.mcpServers || {}
    return Object.entries(mcpServers).map(([name, config]: [string, any]) => ({
      name,
      command: config.command,
      args: config.args,
      url: config.url,
      env: config.env,
    }))
  } catch {
    return []
  }
}

export function updateClaudeSettingsMcp(jsonContent: string, servers: McpServer[]): string {
  try {
    const parsed = JSON.parse(jsonContent)
    const mcpServers: Record<string, any> = {}
    for (const server of servers) {
      const entry: any = {}
      if (server.url) entry.url = server.url
      if (server.command) entry.command = server.command
      if (server.args?.length) entry.args = server.args
      if (server.env && Object.keys(server.env).length) entry.env = server.env
      mcpServers[server.name] = entry
    }
    parsed.mcpServers = mcpServers
    return JSON.stringify(parsed, null, 2)
  } catch {
    return jsonContent
  }
}

// ── Claude ~/.claude.json parsing (internal state with global + per-project MCP) ──

function extractMcpServers(mcpObj: Record<string, any>): McpServer[] {
  return Object.entries(mcpObj).map(([name, config]: [string, any]) => ({
    name,
    type: config.type,
    command: config.command,
    args: config.args,
    url: config.url,
    env: config.env,
  }))
}

export function parseClaudeStateMcp(jsonContent: string): McpGroup[] {
  try {
    const parsed = JSON.parse(jsonContent)
    const groups: McpGroup[] = []

    const globalMcp = parsed.mcpServers || {}
    if (Object.keys(globalMcp).length > 0) {
      groups.push({
        scope: 'global',
        label: '全局 MCP（~/.claude.json）',
        servers: extractMcpServers(globalMcp),
      })
    }

    const projects = parsed.projects || {}
    for (const [projectPath, projectConfig] of Object.entries(projects) as [string, any][]) {
      const projectMcp = projectConfig.mcpServers || {}
      if (Object.keys(projectMcp).length > 0) {
        groups.push({
          scope: 'project',
          label: projectPath,
          projectPath,
          servers: extractMcpServers(projectMcp),
        })
      }
    }

    return groups
  } catch {
    return []
  }
}

export function updateClaudeStateMcpGlobal(jsonContent: string, servers: McpServer[]): string {
  try {
    const parsed = JSON.parse(jsonContent)
    const mcpServers: Record<string, any> = {}
    for (const server of servers) {
      const entry: any = {}
      if (server.type) entry.type = server.type
      if (server.url) entry.url = server.url
      if (server.command) entry.command = server.command
      if (server.args?.length) entry.args = server.args
      entry.env = server.env || {}
      mcpServers[server.name] = entry
    }
    parsed.mcpServers = mcpServers
    return JSON.stringify(parsed, null, 2)
  } catch {
    return jsonContent
  }
}

export function updateClaudeStateProjectMcp(
  jsonContent: string,
  projectPath: string,
  servers: McpServer[],
): string {
  try {
    const parsed = JSON.parse(jsonContent)
    if (!parsed.projects) parsed.projects = {}
    if (!parsed.projects[projectPath]) parsed.projects[projectPath] = {}
    const mcpServers: Record<string, any> = {}
    for (const server of servers) {
      const entry: any = {}
      if (server.type) entry.type = server.type
      if (server.url) entry.url = server.url
      if (server.command) entry.command = server.command
      if (server.args?.length) entry.args = server.args
      entry.env = server.env || {}
      mcpServers[server.name] = entry
    }
    parsed.projects[projectPath].mcpServers = mcpServers
    return JSON.stringify(parsed, null, 2)
  } catch {
    return jsonContent
  }
}

// ── Gemini ~/.gemini/settings.json parsing ──

export function parseGeminiMcpServers(jsonContent: string): McpServer[] {
  try {
    const parsed = JSON.parse(jsonContent)
    const mcpServers = parsed.mcpServers || {}
    return Object.entries(mcpServers).map(([name, config]: [string, any]) => ({
      name,
      command: config.command,
      args: config.args,
      url: config.url,
      env: config.env,
    }))
  } catch {
    return []
  }
}

export function updateGeminiMcpServers(jsonContent: string, servers: McpServer[]): string {
  try {
    const parsed = jsonContent.trim() ? JSON.parse(jsonContent) : {}
    const mcpServers: Record<string, any> = {}
    for (const server of servers) {
      const entry: any = {}
      if (server.url) entry.url = server.url
      if (server.command) entry.command = server.command
      if (server.args?.length) entry.args = server.args
      if (server.env && Object.keys(server.env).length) entry.env = server.env
      mcpServers[server.name] = entry
    }
    parsed.mcpServers = mcpServers
    return JSON.stringify(parsed, null, 2)
  } catch {
    return jsonContent
  }
}

export function getAllClaudeMcpCount(stateContent: string | null, settingsContent: string | null): number {
  let count = 0
  if (stateContent) {
    const groups = parseClaudeStateMcp(stateContent)
    for (const g of groups) count += g.servers.length
  }
  if (settingsContent) {
    count += parseClaudeSettingsMcp(settingsContent).length
  }
  return count
}
