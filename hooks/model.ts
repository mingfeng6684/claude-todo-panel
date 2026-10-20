import type { TodoDoc, TodoItem } from '../types'

export const FILE = '.claude/todo-panel.md'

const ABSOLUTE = /^(?:[A-Za-z]:[\\/]|[\\/])/

/** A project path anchored at the folder the session started in, using that folder's separator. */
export function inProject(root: string | undefined, path: string): string {
  if (!root || ABSOLUTE.test(path)) return path
  const sep = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${sep}${path.replace(/[\\/]/g, sep)}`
}

const HEADER = '<!-- todo-panel: kept by the todo-panel mod; safe to edit by hand -->'
const ITEM = /^- \[([ xX])\] (.*?)(?:\s*<!--(.*?)-->)?\s*$/
const NOTE = /^\s{2,}- (.*)$/

type Section = 'sources' | 'decisions' | 'backlog' | null

export const emptyDoc = (): TodoDoc => ({ sources: [], decisions: [], backlog: [] })

function readMeta(raw: string | undefined): Record<string, string> {
  const meta: Record<string, string> = {}
  for (const pair of (raw ?? '').trim().split(/\s+/)) {
    const at = pair.indexOf(':')
    if (at > 0) meta[pair.slice(0, at)] = decodeURIComponent(pair.slice(at + 1))
  }
  return meta
}

function writeMeta(item: TodoItem): string {
  const pairs = [`id:${item.id}`]
  if (item.blocks) pairs.push(`blocks:${encodeURIComponent(item.blocks)}`)
  if (item.source) pairs.push(`src:${encodeURIComponent(item.source)}`)
  return ` <!-- ${pairs.join(' ')} -->`
}

/** Parses the file; checked items are treated as done and dropped. */
export function parse(text: string): TodoDoc {
  const doc = emptyDoc()
  let section: Section = null
  let last: TodoItem | null = null

  for (const line of text.split(/\r?\n/)) {
    const heading = /^##\s+(.*)$/.exec(line)
    if (heading) {
      const name = (heading[1] ?? '').trim().toLowerCase()
      section = name.startsWith('source') ? 'sources'
        : name.includes('decision') ? 'decisions'
        : name.startsWith('backlog') ? 'backlog'
        : null
      last = null
      continue
    }
    if (section === 'sources') {
      const src = /^- (.+)$/.exec(line)
      if (src?.[1]) doc.sources.push(src[1].trim())
      continue
    }
    if (section === null) continue
    const item = ITEM.exec(line)
    if (item) {
      last = null
      if ((item[1] ?? ' ') !== ' ') continue
      const meta = readMeta(item[3])
      last = {
        id: meta.id ?? '',
        title: (item[2] ?? '').trim(),
        ...(meta.blocks ? { blocks: meta.blocks } : {}),
        ...(meta.src ? { source: meta.src } : {}),
      }
      if (last.title) doc[section].push(last)
      continue
    }
    const note = NOTE.exec(line)
    if (note?.[1] && last && !last.why) last.why = note[1].trim()
  }
  return withIds(doc)
}

/** Gives every item a unique id: a missing or repeated one is replaced. */
function withIds(doc: TodoDoc): TodoDoc {
  const all = new Set([...doc.decisions, ...doc.backlog].map(i => i.id).filter(Boolean))
  const seen = new Set<string>()
  const fill = (list: TodoItem[], prefix: string) =>
    list.map(item => {
      if (item.id && !seen.has(item.id)) {
        seen.add(item.id)
        return item
      }
      const id = nextId(all, prefix)
      all.add(id)
      seen.add(id)
      return { ...item, id }
    })
  return { ...doc, decisions: fill(doc.decisions, 'd'), backlog: fill(doc.backlog, 't') }
}

function nextId(used: Set<string>, prefix: string): string {
  let n = 1
  while (used.has(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

export function serialize(doc: TodoDoc): string {
  const lines = [HEADER, '# To Do', '', '## Sources']
  for (const src of doc.sources) lines.push(`- ${src}`)
  lines.push('', '## Pending Decisions')
  for (const d of doc.decisions) lines.push(`- [ ] ${d.title}${writeMeta(d)}`)
  lines.push('', '## Backlog')
  for (const t of doc.backlog) {
    lines.push(`- [ ] ${t.title}${writeMeta(t)}`)
    if (t.why) lines.push(`  - ${t.why}`)
  }
  return lines.join('\n') + '\n'
}

export type Op =
  | { op: 'add_task'; title: string; why?: string; source?: string; before?: string }
  | { op: 'add_decision'; question: string; blocks?: string; source?: string }
  | { op: 'edit'; id: string; title?: string; why?: string; blocks?: string }
  | { op: 'remove'; id: string }
  | { op: 'reorder'; ids: string[] }
  | { op: 'set_sources'; sources: string[] }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Applies ops in order; returns the new doc and one note per op that did nothing. */
export function apply(doc: TodoDoc, ops: readonly Op[]): { doc: TodoDoc; notes: string[] } {
  let next: TodoDoc = { sources: [...doc.sources], decisions: [...doc.decisions], backlog: [...doc.backlog] }
  const notes: string[] = []
  const ids = () => new Set([...next.decisions, ...next.backlog].map(i => i.id))

  for (const op of ops) {
    switch (op.op) {
      case 'add_task': {
        if (!op.title?.trim()) { notes.push('add_task: empty title'); break }
        if (next.backlog.some(t => same(t.title, op.title))) { notes.push(`add_task: "${op.title}" is already listed`); break }
        const item: TodoItem = {
          id: nextId(ids(), 't'),
          title: op.title.trim(),
          ...(op.why ? { why: op.why.trim() } : {}),
          ...(op.source ? { source: op.source } : {}),
        }
        const at = op.before ? next.backlog.findIndex(t => t.id === op.before) : -1
        next.backlog = at >= 0
          ? [...next.backlog.slice(0, at), item, ...next.backlog.slice(at)]
          : [...next.backlog, item]
        break
      }
      case 'add_decision': {
        if (!op.question?.trim()) { notes.push('add_decision: empty question'); break }
        if (next.decisions.some(d => same(d.title, op.question))) { notes.push(`add_decision: "${op.question}" is already listed`); break }
        next.decisions = [...next.decisions, {
          id: nextId(ids(), 'd'),
          title: op.question.trim(),
          ...(op.blocks ? { blocks: op.blocks } : {}),
          ...(op.source ? { source: op.source } : {}),
        }]
        break
      }
      case 'edit': {
        const patch = (item: TodoItem): TodoItem => item.id !== op.id ? item : {
          ...item,
          ...(op.title ? { title: op.title.trim() } : {}),
          ...(op.why !== undefined ? { why: op.why.trim() } : {}),
          ...(op.blocks !== undefined ? { blocks: op.blocks } : {}),
        }
        if (!ids().has(op.id)) { notes.push(`edit: no item ${op.id}`); break }
        next.decisions = next.decisions.map(patch)
        next.backlog = next.backlog.map(patch)
        break
      }
      case 'remove': {
        if (!ids().has(op.id)) { notes.push(`remove: no item ${op.id}`); break }
        next.decisions = next.decisions.filter(i => i.id !== op.id)
        next.backlog = next.backlog.filter(i => i.id !== op.id)
        break
      }
      case 'reorder': {
        const byId = new Map(next.backlog.map(t => [t.id, t]))
        const first = op.ids.map(id => byId.get(id)).filter((t): t is TodoItem => t !== undefined)
        const rest = next.backlog.filter(t => !op.ids.includes(t.id))
        next.backlog = [...first, ...rest]
        break
      }
      case 'set_sources':
        next.sources = op.sources.map(s => s.trim()).filter(Boolean)
        break
      default:
        notes.push(`unknown op ${JSON.stringify(op)}`)
    }
  }
  // A blocker that names a removed task no longer blocks anything.
  const live = new Set(next.backlog.map(t => t.id))
  next = { ...next, decisions: next.decisions.map(d => (d.blocks && !live.has(d.blocks) ? { id: d.id, title: d.title, ...(d.source ? { source: d.source } : {}) } : d)) }
  return { doc: next, notes }
}

/** The compact listing the update tool answers with. */
export function summary(doc: TodoDoc): string {
  const lines = ['Pending Decisions:']
  if (doc.decisions.length === 0) lines.push('  (none)')
  for (const d of doc.decisions) lines.push(`  ${d.id} ${d.title}${d.blocks ? ` [blocks ${d.blocks}]` : ''}`)
  lines.push('Backlog (in priority order):')
  if (doc.backlog.length === 0) lines.push('  (none)')
  for (const t of doc.backlog) lines.push(`  ${t.id} ${t.title}${t.why ? ` (why: ${t.why})` : ''}`)
  if (doc.sources.length) lines.push(`Sources: ${doc.sources.join(', ')}`)
  return lines.join('\n')
}

/**
 * Folds the built-in task list into the backlog: tasks still open are added
 * (marked src:session), session tasks finished since are removed.
 */
export function syncSession(doc: TodoDoc, tasks: readonly { title: string; isDone: boolean }[]): TodoDoc {
  const done = tasks.filter(t => t.isDone)
  const open = tasks.filter(t => !t.isDone)
  let backlog = doc.backlog.filter(t => !(t.source === 'session' && done.some(d => same(d.title, t.title))))
  const used = new Set([...doc.decisions, ...backlog].map(i => i.id))
  for (const task of open) {
    if (backlog.some(t => same(t.title, task.title))) continue
    const id = nextId(used, 't')
    used.add(id)
    backlog = [...backlog, { id, title: task.title.trim(), source: 'session' }]
  }
  return { ...doc, backlog }
}

/** Drops items whose source plan file now shows them ticked (`- [x] title`). */
export function syncPlans(doc: TodoDoc, files: ReadonlyMap<string, string>): TodoDoc {
  const ticked = (item: TodoItem) => {
    const text = item.source ? files.get(item.source) : undefined
    if (!text) return false
    return text.split(/\r?\n/).some(line => {
      const m = /^\s*[-*] \[[xX]\]\s+(.*)$/.exec(line)
      return m?.[1] !== undefined && (same(m[1], item.title) || m[1].toLowerCase().includes(item.title.trim().toLowerCase()))
    })
  }
  return { ...doc, decisions: doc.decisions.filter(d => !ticked(d)), backlog: doc.backlog.filter(t => !ticked(t)) }
}

export const isPlanSource = (src: string | undefined): src is string =>
  src !== undefined && src !== 'session' && /\.(md|markdown)$/i.test(src)
