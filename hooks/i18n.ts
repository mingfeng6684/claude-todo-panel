import type { Lang } from '../types'

export const TEXT = {
  'zh-TW': {
    name: '繁體中文',
    sortedBy: '依 Claude 建議優先序',
    decisions: '待決策事項',
    backlog: '待執行任務',
    blocks: '阻塞：',
    decideHint: '輸入 /decide-questions，Claude 會逐項提出決策問題。',
    noDecisions: '目前無待決策事項。',
    noBacklog: '目前無待執行任務。',
    notInit: '此專案尚未啟用 To Do。輸入 /todo init 開始初始化。',
    opened: 'To Do 面板已開啟。',
    initStarted: '開始初始化 To Do。',
    decideStarted: '開始處理待決策事項。',
    nothingToDecide: '目前無待決策事項。',
    closed: 'To Do 面板已關閉。輸入 /todo show 可再次開啟。',
    submitFailed: '無法送出 To Do 的提示，請再輸入一次指令。',
    usage: '用法：/todo show 開啟面板、/todo hide 關閉面板、/todo init 初始化此專案。',
  },
  en: {
    name: 'English',
    sortedBy: 'Prioritized by Claude',
    decisions: 'Pending Decisions',
    backlog: 'Backlog',
    blocks: 'Blocks: ',
    decideHint: 'Type /decide-questions and Claude will ask about each decision in turn.',
    noDecisions: 'No pending decisions.',
    noBacklog: 'The backlog is empty.',
    notInit: 'To Do is not set up for this project yet. Type /todo init to start.',
    opened: 'To Do pane opened.',
    initStarted: 'Setting up To Do.',
    decideStarted: 'Going through the pending decisions.',
    nothingToDecide: 'No pending decisions.',
    closed: 'To Do pane closed. Type /todo show to open it again.',
    submitFailed: 'Could not send the To Do prompt. Run the command again.',
    usage: 'Usage: /todo show opens the pane, /todo hide closes it, /todo init sets up this project.',
  },
  ja: {
    name: '日本語',
    sortedBy: 'Claude による優先順位',
    decisions: '未決事項',
    backlog: '未着手タスク',
    blocks: 'ブロック中：',
    decideHint: '/decide-questions と入力すると、Claude が一件ずつ質問します。',
    noDecisions: '未決事項はありません。',
    noBacklog: '未着手タスクはありません。',
    notInit: 'このプロジェクトでは To Do が未設定です。/todo init で開始します。',
    opened: 'To Do パネルを開きました。',
    initStarted: 'To Do の初期化を始めます。',
    decideStarted: '未決事項を順に確認します。',
    nothingToDecide: '未決事項はありません。',
    closed: 'To Do パネルを閉じました。/todo show で再び開けます。',
    submitFailed: 'To Do のプロンプトを送信できませんでした。もう一度コマンドを入力してください。',
    usage: '使い方：/todo show でパネルを開く、/todo hide で閉じる、/todo init でこのプロジェクトを初期化。',
  },
} as const satisfies Record<Lang, Record<string, string>>

/** Maps a free-form language name or locale ("繁體中文", "Japanese", "en_US.UTF-8") to a panel language. */
export function toLang(value: string | undefined): Lang | undefined {
  const v = (value ?? '').trim().toLowerCase()
  if (!v || v === 'c' || v === 'posix') return undefined
  if (/日本|japan|^ja\b|^ja[-_]/.test(v)) return 'ja'
  if (/中文|漢|汉|chinese|mandarin|^zh\b|^zh[-_]|台|臺/.test(v)) return 'zh-TW'
  if (/english|^en\b|^en[-_]/.test(v)) return 'en'
  return undefined
}

/** The panel language from the Claude desktop app's config.json text (its `locale`, e.g. "zh-Hant"). */
export function fromAppConfig(text: string): Lang | undefined {
  try {
    const config = JSON.parse(text) as { locale?: unknown }
    return toLang(typeof config.locale === 'string' ? config.locale : undefined)
  } catch {
    return undefined
  }
}

/** What Claude is told each request once the project has a To Do file (kept short: it rides every request). */
export function guidance(lang: Lang): string {
  return [
    'todo-panel: this project keeps a To Do list in .claude/todo-panel.md, shown to the user in a side pane.',
    'Keep it current with the mcp__todo-panel__update tool (it answers with the current list; call it with no ops to read it):',
    '- add a Pending Decision when a question needs the user\'s choice, with `blocks` naming the task it holds up;',
    '- add Backlog tasks for work agreed but not done yet, at task level, never step level;',
    '- remove an item as soon as it is done or decided;',
    '- keep the Backlog in the order you recommend, each task with a one-line `why` for its place; reorder when priorities change.',
    `Write item text in ${TEXT[lang].name}. When the user sends a Backlog task's exact title as their message, do that task.`,
  ].join('\n')
}

export function initPrompt(lang: Lang): string {
  return [
    `[todo-panel] Set up the To Do list for this project. Talk to me in ${TEXT[lang].name}.`,
    '1. Detect candidates: which skills and plugins I use that write plans or tasks (for example superpowers, mattpocock-skills, GitHub issue workflows), and which folders hold plans, specs or docs (docs/, plans/, docs/superpowers/, .github/, and so on). Look, do not guess.',
    '2. Ask me with AskUserQuestion, two multiSelect questions, using what you detected as options: where my plans and docs live, and which skills or workflows produce my plans and tasks. I can also answer with my own paths.',
    '3. Read only what I chose: unchecked `- [ ]` items in plan files such as superpowers plans (take the task level, not every step); mattpocock PRDs, both local PRD files and their GitHub issues (open issues if `gh` works here); TODO/FIXME comments.',
    '4. Show me a proposed list: Pending Decisions (questions only I can answer, each with the task it blocks) and a Backlog in your recommended order with a one-line reason each. Wait for my confirmation or changes.',
    '5. Then write it with mcp__todo-panel__update: set_sources with what I chose, then the add_decision and add_task ops (set `source` to the file a task came from).',
    'If step 1 finds no plans, docs or skills, or I choose none, say so plainly and do not invent tasks. Instead ask me what this project is for and what I want done next, and look at the code itself (missing README, no tests, obvious gaps). Propose a starting list from that and wait for my confirmation.',
    'If I still want nothing listed, write an empty list (set_sources with no sources) so the pane is on; it fills as we work.',
  ].join('\n')
}

export function decidePrompt(lang: Lang, list: string): string {
  return [
    `[todo-panel] Go through the pending decisions with me. Talk to me in ${TEXT[lang].name}.`,
    'First list all of them. Then ask me about each one with AskUserQuestion: one question per decision, 2 to 4 options with a short description each (I can always pick Other and type my own answer).',
    'After I answer, remove each decided item with mcp__todo-panel__update, apply what the answer changes to the Backlog (new tasks, order), and tell me which tasks are now unblocked.',
    '',
    list,
  ].join('\n')
}
