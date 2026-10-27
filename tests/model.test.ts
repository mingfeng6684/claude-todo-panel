import { describe, expect, test } from 'claude-code/testing'

import { apply, inProject, parse, serialize, syncPlans, syncSession } from '../hooks/model'

const SAMPLE = `# To Do

## Sources
- docs/superpowers/plans/

## Pending Decisions
- [ ] API 錯誤碼採用 HTTP 狀態碼或自訂代碼？ <!-- id:d1 blocks:t3 -->

## Backlog
- [ ] 補上登入 API 單元測試 <!-- id:t1 src:docs%2Fplans%2Flogin.md -->
  - 後續任務皆會修改登入流程
- [ ] 設定檔改為讀取環境變數
- [x] 已經做完的事 <!-- id:t9 -->
- [ ] 統一 API 錯誤回應格式 <!-- id:t3 -->
`

describe('the todo file', () => {
  test('parses sections, drops ticked items and fills missing ids', () => {
    const doc = parse(SAMPLE)
    expect(doc.sources).toEqual(['docs/superpowers/plans/'])
    expect(doc.decisions).toEqual([{ id: 'd1', title: 'API 錯誤碼採用 HTTP 狀態碼或自訂代碼？', blocks: 't3' }])
    expect(doc.backlog.map(t => t.id)).toEqual(['t1', 't2', 't3'])
    expect(doc.backlog[0]).toEqual({ id: 't1', title: '補上登入 API 單元測試', source: 'docs/plans/login.md', why: '後續任務皆會修改登入流程' })
  })

  test('round-trips through serialize', () => {
    const doc = parse(SAMPLE)
    expect(parse(serialize(doc))).toEqual(doc)
  })
})

describe('ops', () => {
  test('add, reorder, edit and remove keep the order Claude sets', () => {
    const { doc, notes } = apply(parse(SAMPLE), [
      { op: 'add_task', title: '更新 README 安裝步驟', why: '最後寫' },
      { op: 'add_task', title: '補上登入 API 單元測試' },
      { op: 'reorder', ids: ['t2', 't1'] },
      { op: 'edit', id: 't2', why: '部署前必做' },
      { op: 'add_decision', question: 'v1 端點是否保留？' },
    ])
    expect(notes).toEqual(['add_task: "補上登入 API 單元測試" is already listed'])
    expect(doc.backlog.map(t => t.title)).toEqual(['設定檔改為讀取環境變數', '補上登入 API 單元測試', '統一 API 錯誤回應格式', '更新 README 安裝步驟'])
    expect(doc.backlog[0]?.why).toBe('部署前必做')
    expect(doc.decisions.map(d => d.id)).toEqual(['d1', 'd2'])
  })

  test('removing a task frees the decision that blocked it', () => {
    const { doc } = apply(parse(SAMPLE), [{ op: 'remove', id: 't3' }])
    expect(doc.decisions[0]?.blocks).toBeUndefined()
  })
})

describe('sync', () => {
  test('open session tasks join the backlog and finished ones leave', () => {
    const start = syncSession(parse(SAMPLE), [{ title: '寫遷移腳本', isDone: false }])
    expect(start.backlog.at(-1)).toEqual({ id: 't4', title: '寫遷移腳本', source: 'session' })
    const after = syncSession(start, [{ title: '寫遷移腳本', isDone: true }])
    expect(after.backlog.some(t => t.title === '寫遷移腳本')).toBe(false)
  })

  test('a task ticked in its plan file is removed', () => {
    const files = new Map([['docs/plans/login.md', '### Task 1\n- [x] 補上登入 API 單元測試\n']])
    expect(syncPlans(parse(SAMPLE), files).backlog.map(t => t.id)).toEqual(['t2', 't3'])
  })

  test('a ticked plan item removes only the exact backlog title, never its substrings', () => {
    const { doc } = apply(parse(SAMPLE), [
      { op: 'add_task', title: 'Test', source: 'docs/plans/login.md' },
      { op: 'add_task', title: 'Test login', source: 'docs/plans/login.md' },
    ])
    const synced = syncPlans(doc, new Map([['docs/plans/login.md', '- [ ] Test\n- [x] Test login\n']]))
    expect(synced.backlog.some(t => t.title === 'Test')).toBe(true)
    expect(synced.backlog.some(t => t.title === 'Test login')).toBe(false)
  })
})

describe('paths', () => {
  test('the list stays in the folder the session started in', () => {
    expect(inProject('D:\\Crwork', '.claude/todo-panel.md')).toBe('D:\\Crwork\\.claude\\todo-panel.md')
    expect(inProject('/home/f/app/', '.claude/todo-panel.md')).toBe('/home/f/app/.claude/todo-panel.md')
    expect(inProject('D:\\Crwork', 'C:\\plans\\a.md')).toBe('C:\\plans\\a.md')
    expect(inProject(undefined, 'docs/a.md')).toBe('docs/a.md')
  })
})
