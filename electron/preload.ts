import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getConfigPaths: () => ipcRenderer.invoke('get-config-paths'),
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('write-file', path, content),
  listDir: (path: string) => ipcRenderer.invoke('list-dir', path),
  fileExists: (path: string) => ipcRenderer.invoke('file-exists', path),
  readSkill: (skillDir: string) => ipcRenderer.invoke('read-skill', skillDir),
  listSkills: (skillsRootDir: string) => ipcRenderer.invoke('list-skills', skillsRootDir),
  openInFinder: (path: string) => ipcRenderer.invoke('open-in-finder', path),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  deleteDir: (path: string) => ipcRenderer.invoke('delete-dir', path),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  probeProjectMcp: (dir: string) => ipcRenderer.invoke('probe-project-mcp', dir),
  testMcpServer: (server: { command?: string; args?: string[]; url?: string; env?: Record<string, string> }) =>
    ipcRenderer.invoke('test-mcp-server', server),
})
