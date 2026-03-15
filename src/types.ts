export interface ConfigPaths {
  codex: {
    config: string
    agents: string
    skillsDir: string
  }
  claude: {
    state: string
    settings: string
    settingsLocal: string
    instructions: string
    skillsDir: string
  }
  cursor: {
    mcp: string
    skillsDir: string
    rulesDir: string
  }
  gemini: {
    settings: string
    skillsDir: string
  }
}

export interface McpServer {
  name: string
  command?: string
  args?: string[]
  url?: string
  type?: string
  env?: Record<string, string>
}

export type McpScope = 'global' | 'project'

export interface McpGroup {
  scope: McpScope
  label: string
  projectPath?: string
  servers: McpServer[]
}

export interface SkillInfo {
  name: string
  path: string
  isSystem: boolean
  description: string
}

export interface DirEntry {
  name: string
  isDirectory: boolean
  path: string
}

export interface SkillDetail {
  name: string
  path: string
  content: string | null
  hasAgents: boolean
  hasReferences: boolean
  agents: string[]
  references: string[]
}

export type ToolType = 'codex' | 'claude' | 'cursor'
export type PageType = 'dashboard' | 'mcp' | 'skills' | 'config'

export interface ProjectProbeFile {
  path: string
  label: string
  content: string | null
}

export interface ProjectProbeConfig {
  path: string
  label: string
  tool: string
  content: string | null
  isDir: boolean
}

export interface ProjectProbeSkill {
  name: string
  path: string
  tool: string
  description: string
}

export interface ProjectMcpProbe {
  projectDir: string
  projectName: string
  files: ProjectProbeFile[]
  configs: ProjectProbeConfig[]
  skills: ProjectProbeSkill[]
  mcpJsonPath: string
  cursorMcpPath: string
  claudeSettingsPath: string
}

declare global {
  interface Window {
    electronAPI: {
      getConfigPaths: () => Promise<ConfigPaths>
      readFile: (path: string) => Promise<string | null>
      writeFile: (path: string, content: string) => Promise<boolean>
      listDir: (path: string) => Promise<DirEntry[]>
      fileExists: (path: string) => Promise<boolean>
      readSkill: (skillDir: string) => Promise<SkillDetail>
      listSkills: (skillsRootDir: string) => Promise<SkillInfo[]>
      openInFinder: (path: string) => Promise<void>
      openExternal: (url: string) => Promise<void>
      deleteDir: (path: string) => Promise<boolean>
      selectFolder: () => Promise<string | null>
      probeProjectMcp: (dir: string) => Promise<ProjectMcpProbe>
      testMcpServer: (server: {
        command?: string; args?: string[]; url?: string; env?: Record<string, string>
      }) => Promise<McpTestResult>
    }
  }
}

export interface McpTestResult {
  ok: boolean
  message: string
  serverName?: string
}
