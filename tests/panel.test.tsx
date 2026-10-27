import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = { component: 'Pane', requestId: 'todo-panel', props: { title: 'To Do', isFocused: false, bodyColumns: 40, placement: 'dock' } } as const

function world(on: On) {
  const files = new Map<string, string>()
  const filled: string[] = []
  const key = (path: string) => path.replace(/\\/g, '/').replace(/^.*?(\.claude\/todo-panel\.md)$/, '$1')
  on('fs.read', ($, e) => {
    const text = files.get(key(e.path))
    return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    files.set(key(e.path), e.text)
    return { value: undefined }
  })
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('prompt.fill', ($, e) => {
    filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  return { files, filled, opened }
}

test('the update tool writes the file and answers with the list', async ($, on) => {
  const { files } = world(on)
  const ran = await $.tool.call({
    tool: 'mcp__todo-panel__update',
    ops: [
      { op: 'add_task', title: 'Add login tests', why: 'Later work touches login' },
      { op: 'add_decision', question: 'Keep the v1 endpoints?' },
    ],
  })
  expect(ran.deny).toBeUndefined()
  expect(String(ran.result)).toContain('t1 Add login tests')
  expect(files.get('.claude/todo-panel.md')).toContain('- [ ] Keep the v1 endpoints? <!-- id:d1 -->')
})

test('an edit made outside the session survives the next update', async ($, on) => {
  const { files } = world(on)
  await $.tool.call({ tool: 'mcp__todo-panel__update', ops: [{ op: 'add_task', title: 'Add login tests' }] })
  const text = files.get('.claude/todo-panel.md') ?? ''
  files.set('.claude/todo-panel.md', text.replace('## Backlog', '## Backlog\n- [ ] Added elsewhere <!-- id:t9 -->'))
  const ran = await $.tool.call({ tool: 'mcp__todo-panel__update', ops: [{ op: 'add_task', title: 'Second task' }] })
  expect(String(ran.result)).toContain('Added elsewhere')
  const saved = files.get('.claude/todo-panel.md') ?? ''
  expect(saved).toContain('Added elsewhere')
  expect(saved).toContain('Second task')
})

test('pressing a backlog task puts only its title in the prompt box', async ($, on) => {
  const { filled } = world(on)
  await $.tool.call({ tool: 'mcp__todo-panel__update', ops: [{ op: 'add_task', title: 'Add login tests' }] })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'todo-panel', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /Backlog \(1\)/ })).toBeDefined()
    await ui.press({ key: 'fill-t1' })
    await ui.unmount()
  }
  expect(filled).toEqual(['Add login tests', 'Add login tests'])
})

test('after /todo hide, updates no longer pop the pane open until /todo show', async ($, on) => {
  const { opened } = world(on)
  await $.command.run({ command: 'todo', args: 'hide' })
  await $.tool.call({ tool: 'mcp__todo-panel__update', ops: [{ op: 'add_task', title: 'Add login tests' }] })
  expect(opened).toEqual([])
  await $.command.run({ command: 'todo', args: 'show' })
  expect(opened).toEqual(['todo-panel'])
})

test('/todo init sends the setup prompt once the command has finished', async ($, on) => {
  world(on)
  const clock = mock.clock(on)
  const submitted: string[] = []
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  const ran = await $.command.run({ command: 'todo', args: 'init' })
  expect(String(ran.text)).toContain('To Do')
  await clock.settle()
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('[todo-panel] Set up the To Do list')
})

test('built-in tasks join the backlog at turn end and leave once completed or deleted', async ($, on) => {
  const { files } = world(on)
  on('tool.call', { tool: 'TaskCreate' }, ($, e) => ({ result: { task: { id: e.subject === 'Write docs' ? '1' : '2', subject: e.subject } } }))
  on('tool.call', { tool: 'TaskUpdate' }, () => ({ result: { success: true } }))
  on('turn.complete', ($, e) => ({ text: '' }))
  await $.tool.call({ tool: 'mcp__todo-panel__update', ops: [{ op: 'set_sources', sources: [] }] })
  const end = { answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write docs', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Fix build', description: '' })
  await $.turn.complete(end)
  expect(files.get('.claude/todo-panel.md')).toContain('Write docs')
  expect(files.get('.claude/todo-panel.md')).toContain('Fix build')
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'deleted' })
  await $.turn.complete(end)
  expect(files.get('.claude/todo-panel.md')).not.toContain('Write docs')
  expect(files.get('.claude/todo-panel.md')).not.toContain('Fix build')
})
