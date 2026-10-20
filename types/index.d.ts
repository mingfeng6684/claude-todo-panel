export type Lang = 'zh-TW' | 'en' | 'ja'

export type TodoItem = {
  id: string
  title: string
  why?: string
  source?: string
  blocks?: string
}

export type TodoDoc = {
  sources: string[]
  decisions: TodoItem[]
  backlog: TodoItem[]
}

export type SessionTask = { key: string; title: string; isDone: boolean }

declare module 'claude-code' {
  interface PluginState {
    'todo-panel': {
      doc: TodoDoc | null
      lang: Lang
      tasks: SessionTask[]
      isHidden: boolean
    }
  }
}
