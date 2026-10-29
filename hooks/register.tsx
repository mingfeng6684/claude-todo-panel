import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Lang, SessionTask, TodoDoc } from '../types'
import { TEXT, decidePrompt, fromAppConfig, guidance, initPrompt, toLang } from './i18n'
import { FILE, apply, emptyDoc, inProject, isPlanSource, parse, serialize, summary, syncPlans, syncSession } from './model'
import type { Op } from './model'

const PANE = 'todo-panel'
const TOOL = 'mcp__todo-panel__update'

const docAtom = atom({ plugin: 'todo-panel', key: 'doc' } as const, null as TodoDoc | null)
const langAtom = atom({ plugin: 'todo-panel', key: 'lang' } as const, 'en' as Lang)
const tasksAtom = atom({ plugin: 'todo-panel', key: 'tasks' } as const, [] as SessionTask[])
const hiddenAtom = atom({ plugin: 'todo-panel', key: 'isHidden' } as const, false)

const UPDATE_SCHEMA = {
  type: 'object',
  properties: {
    ops: {
      type: 'array',
      description: 'Changes applied in order. Leave empty to just read the list.',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add_task', 'add_decision', 'edit', 'remove', 'reorder', 'set_sources'] },
          id: { type: 'string', description: 'edit/remove: the item id (t1, d1, ...)' },
          title: { type: 'string', description: 'add_task/edit: task title, short' },
          question: { type: 'string', description: 'add_decision: the question the user must decide' },
          why: { type: 'string', description: 'add_task/edit: one line on why the task sits at this place' },
          blocks: { type: 'string', description: 'add_decision/edit: id of the task this decision holds up' },
          source: { type: 'string', description: 'file the item came from, e.g. docs/plans/x.md' },
          before: { type: 'string', description: 'add_task: insert before this task id (default: end)' },
          ids: { type: 'array', items: { type: 'string' }, description: 'reorder: backlog ids in the new order' },
          sources: { type: 'array', items: { type: 'string' }, description: 'set_sources: doc folders and skills to read from' },
        },
        required: ['op'],
      },
    },
  },
}

let lastText: string | undefined
/** The folder the session started in: the list stays there when a command `cd`s elsewhere. */
let root: string | undefined

async function readText($: EngineInterface): Promise<string | undefined> {
  try {
    return await $.fs.read(inProject(root, FILE))
  } catch {
    return undefined
  }
}

async function load($: EngineInterface): Promise<TodoDoc | null> {
  const text = await readText($)
  lastText = text
  return text === undefined ? null : parse(text)
}

/** The list a change starts from: the file's, else the one this session holds. */
async function baseOf($: EngineInterface, text: string | undefined): Promise<TodoDoc> {
  return text !== undefined ? parse(text) : ((await read($, docAtom)) ?? emptyDoc())
}

const ATTEMPTS = 3
const CONFLICT = '.claude/todo-panel.md changed while saving, so todo-panel left the newer version in place. Call the tool with no ops to read the list, then redo any change it is missing.'

type Change = { doc: TodoDoc; notes: string[] }

/**
 * Changes the list as it is on disk right now, so edits made outside this
 * session are kept. The host has no conditional write, so the file is read
 * again just before the write, with nothing awaited in between, and read back
 * after it. A version newer than the one changed is never written over: the
 * change is redone on it, up to ATTEMPTS times, and otherwise nothing is
 * written. Answers undefined when another writer won.
 */
async function rewrite($: EngineInterface, change: (base: TodoDoc) => Change | Promise<Change>): Promise<Change | undefined> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const baseText = await readText($)
    const base = await baseOf($, baseText)
    const changed = await change(base)
    const text = serialize(changed.doc)
    if (baseText !== undefined && text === serialize(base)) {
      lastText = baseText
    } else {
      if ((await readText($)) !== baseText) continue
      await $.fs.write(inProject(root, FILE), text)
      if ((await readText($)) !== text) return undefined
      lastText = text
    }
    await update($, docAtom, () => changed.doc)
    return changed
  }
  return undefined
}

/** No ops only reads the list, and never creates the file. */
async function applyToFile($: EngineInterface, ops: readonly Op[]): Promise<Change | undefined> {
  if (ops.length > 0) return rewrite($, base => apply(base, ops))
  return apply(await baseOf($, await readText($)), ops)
}

async function resolveLang($: EngineInterface, options: PluginOptions): Promise<Lang> {
  const chosen = toLang(String(options.language ?? 'auto'))
  if (chosen) return chosen
  const settings = await $.settings.read().catch(() => ({}) as Record<string, unknown>)
  const fromSettings = toLang(typeof settings.language === 'string' ? settings.language : undefined)
  if (fromSettings) return fromSettings
  const fromApp = await appLocale($)
  if (fromApp) return fromApp
  return toLang(await $.env.get('LC_ALL')) ?? toLang(await $.env.get('LC_MESSAGES')) ?? toLang(await $.env.get('LANG')) ?? 'en'
}

/** The language picked in the Claude desktop app (its config.json `locale`, e.g. "zh-Hant"). */
async function appLocale($: EngineInterface): Promise<Lang | undefined> {
  const appData = await $.env.get('APPDATA')
  const home = await $.env.get('HOME')
  const paths = [
    ...(appData ? [`${appData}\\Claude\\config.json`] : []),
    ...(home ? [`${home}/Library/Application Support/Claude/config.json`, `${home}/.config/Claude/config.json`] : []),
  ]
  for (const path of paths) {
    try {
      const lang = fromAppConfig(await $.fs.read(path))
      if (lang) return lang
    } catch {
      // No desktop app config here.
    }
  }
  return undefined
}

/** Drops items whose plan file now has them ticked. */
async function withPlans($: EngineInterface, doc: TodoDoc): Promise<TodoDoc> {
  const paths = [...new Set([...doc.decisions, ...doc.backlog].map(i => i.source).filter(isPlanSource))]
  const files = new Map<string, string>()
  for (const path of paths) {
    try {
      files.set(path, await $.fs.read(inProject(root, path)))
    } catch {
      // A plan that moved or was deleted keeps its items.
    }
  }
  return syncPlans(doc, files)
}

/** A command's own run cannot submit a prompt; it goes once the command has finished. */
function submitLater($: EngineInterface, text: string) {
  $.clock.after(0, () => {
    void (async () => {
      const lang = await read($, langAtom)
      try {
        const sent = await $.prompt.submit({ text })
        if ('drop' in sent) $.ui.toast(TEXT[lang].submitFailed)
      } catch {
        $.ui.toast(TEXT[lang].submitFailed)
      }
    })()
  })
}

/** Opens the pane; an automatic open stays away once the person closed it this session. */
async function openPane($: EngineInterface, isAsked = false) {
  if (isAsked) await update($, hiddenAtom, () => false)
  else if (await read($, hiddenAtom)) return
  await $.ui.open({ id: PANE, title: 'To Do' })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    root = e.cwd
    await $.command.register({ name: 'todo', description: 'To Do pane: `/todo show` opens it, `/todo hide` closes it, `/todo init` sets it up for this project', argumentHint: '[show|hide|init]' })
    await $.command.register({ name: 'decide-questions', description: 'Let Claude ask you about each pending decision in the To Do list' })
    await $.tool.register({
      name: 'update',
      description: [
        'Read or change the project To Do list (.claude/todo-panel.md) the user sees in a side pane. Answers with the current list; call with no ops to read it.',
        'Pending Decisions: questions only the user can answer (blocks = the task id it holds up). Backlog: work agreed but not done, at task level (never single steps), in the order you recommend, each with a one-line why for its place.',
        'Remove an item once done or decided. Only use this when the project has a To Do list or the user asked to set one up.',
      ].join(' '),
      inputSchema: UPDATE_SCHEMA,
      isDeferred: false,
    })
    const lang = await resolveLang($, options)
    await update($, langAtom, () => lang)

    const doc = await load($)
    if (doc) {
      await rewrite($, async base => ({ doc: await withPlans($, base), notes: [] }))
      void openPane($)
    } else {
      await update($, docAtom, () => null)
    }

    // Picks up hand edits of the file and language changes.
    $.clock.every(4000, () => {
      void (async () => {
        const nowLang = await resolveLang($, options)
        if (nowLang !== (await read($, langAtom))) await update($, langAtom, () => nowLang)
        const before = lastText
        const fresh = await load($)
        if (lastText !== before) await update($, docAtom, () => fresh)
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    const t = TEXT[await read($, langAtom)]
    const arg = e.args.trim().toLowerCase()
    if (arg === 'init') {
      // The pane opens on the first write, so it never shows "not set up" mid-init.
      submitLater($, initPrompt(await read($, langAtom)))
      return { text: t.initStarted }
    }
    if (arg === 'hide' || arg === 'close') {
      await update($, hiddenAtom, () => true)
      await $.ui.close({ id: PANE })
      return { text: t.closed }
    }
    if (arg !== '' && arg !== 'show') return { text: t.usage }
    await openPane($, true)
    return { text: (await read($, docAtom)) === null ? t.notInit : t.opened }
  })

  on('command.run', { command: 'decide-questions' }, async $ => {
    const lang = await read($, langAtom)
    const doc = await read($, docAtom)
    if (doc === null) return { text: TEXT[lang].notInit }
    if (doc.decisions.length === 0) return { text: TEXT[lang].nothingToDecide }
    submitLater($, decidePrompt(lang, summary(doc)))
    return { text: TEXT[lang].decideStarted }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await update($, hiddenAtom, () => true)
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if ((await read($, docAtom)) === null) return composed
    const lang = await read($, langAtom)
    return { sections: [...composed.sections, { id: 'todo-panel:guidance', text: guidance(lang), scope: 'session' as const }] }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as { ops?: Op[] }
    const ops = input.ops ?? []
    const changed = await applyToFile($, ops)
    if (changed === undefined) return { deny: CONFLICT }
    const { doc, notes } = changed
    if (ops.length > 0) void openPane($)
    return { result: [summary(doc), ...notes.map(n => `note: ${n}`)].join('\n') }
  }).catch(() => ({ deny: 'todo-panel could not update .claude/todo-panel.md.' }))

  // Built-in task list: remember each task's title and state, fold into the backlog at turn end.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'TodoWrite' && ran.deny === undefined && !ran.isError) {
      const tasks = e.todos.map(t => ({ key: `todo:${t.content}`, title: t.content, isDone: t.status === 'completed' }))
      await update($, tasksAtom, list => [...list.filter(t => !t.key.startsWith('todo:')), ...tasks])
    }
    return ran
  })
    .catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'TaskCreate' && ran.deny === undefined && !ran.isError && ran.result) {
      const id = (ran.result as { task?: { id?: string } }).task?.id
      if (id) await update($, tasksAtom, list => [...list.filter(t => t.key !== `task:${id}`), { key: `task:${id}`, title: e.subject, isDone: false }])
    }
    return ran
  })
    .catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'TaskUpdate' && ran.deny === undefined && !ran.isError) {
      const key = `task:${e.taskId}`
      await update($, tasksAtom, list =>
        e.status === 'deleted'
          ? list.map(t => (t.key !== key ? t : { ...t, isDone: true }))
          : list.map(t => (t.key !== key ? t : { ...t, title: e.subject ?? t.title, isDone: e.status ? e.status === 'completed' : t.isDone })),
      )
    }
    return ran
  })
    .catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.isAborted || (await read($, docAtom)) === null) return done
    // Sync against the file as it is now, not the cached doc, so hand edits survive.
    if ((await load($)) === null) return done
    const tasks = await read($, tasksAtom)
    // A conflict is left alone: the next turn syncs again.
    await rewrite($, async base => ({ doc: await withPlans($, syncSession(base, tasks)), notes: [] }))
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const lang = await read($, langAtom)
    const doc = await read($, docAtom)
    const t = TEXT[lang]

    if (doc === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{t.notInit}</Text>
        </Box>
      )
    }

    const titleOf = (id: string | undefined) => doc.backlog.find(task => task.id === id)?.title

    return (
      <Box flexDirection="column">
        <Text dimColor>{t.sortedBy}</Text>
        <Text> </Text>
        <Text bold>{t.decisions} ({doc.decisions.length})</Text>
        {doc.decisions.length === 0 && <Text dimColor>{t.noDecisions}</Text>}
        {doc.decisions.map(d => (
          <Box key={`d-${d.id}`} flexDirection="column">
            <Text>? {d.title}</Text>
            {titleOf(d.blocks) !== undefined && <Text dimColor>  {t.blocks}{titleOf(d.blocks)}</Text>}
          </Box>
        ))}
        {doc.decisions.length > 0 && <Text dimColor>{t.decideHint}</Text>}
        <Text> </Text>
        <Text bold>{t.backlog} ({doc.backlog.length})</Text>
        {doc.backlog.length === 0 && <Text dimColor>{t.noBacklog}</Text>}
        {doc.backlog.map((task, i) => (
          <Box key={`t-${task.id}`} flexDirection="column">
            <Button key={`fill-${task.id}`} plain onPress={() => $.prompt.fill({ text: task.title, mode: 'replace' })}>
              {`${i + 1}. ${task.title}`}
            </Button>
            {task.why !== undefined && <Text dimColor>   {task.why}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
