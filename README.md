# todo-panel

Claude Code 的 To Do 面板：只顯示「待決策事項」和「待執行任務」，順序由 Claude 決定。
資料存在專案裡的 `.claude/todo-panel.md`，完成或決定後的項目會自動移除。

## 安裝

需要 Claude Code 2.1.287 以上（用 `claude --version` 查看，`claude update` 更新）。

在終端機執行：

```
claude plugin marketplace add mingfeng6684/claude-todo-panel
claude plugin install todo-panel@todo-panel-local
```

或在終端機的 Claude Code session 裡輸入：

```
/plugin install todo-panel --marketplace mingfeng6684/claude-todo-panel
```

出現 `Add marketplace?` 時回答 `y`，範圍選 user。裝好後開新的 Claude Code session，或在既有的 session 輸入 `/reload-plugins`。

桌面 App 裡不能用 `/plugin`：點輸入框旁的 +，選 Plugins → Add marketplace，輸入 `mingfeng6684/claude-todo-panel`，再 Add plugin。

## 使用

| 指令 | 做什麼 |
|---|---|
| `/todo show` | 開啟 To Do 面板 |
| `/todo hide` | 關閉面板（也可以點面板上的關閉鈕）；關掉後這次 session 不會再自動跳出，直到你再輸入 `/todo show` |
| `/todo init` | 第一次在專案啟用：Claude 先問你文件放哪、用哪些 skill，再整理出清單給你確認 |
| `/decide-questions` | Claude 列出所有待決策事項，再一題一題問你 |

- 點面板上的任務，輸入框會填入任務名稱，按送出就好。
- 想調整順序，直接跟 Claude 說。
- 面板語言依序跟隨：`/config` 的 todo-panel 選項（zh-TW、en、ja）→ Claude Code 設定的 `language` → Claude 桌面 App 選的語言 → 系統的 `LANG`。

## Token 用量

面板顯示、點擊填入、任務同步都在本機執行，不花 token。Claude 每次請求多帶約 300–600 token 的工具說明（會被快取），
新增或更新一筆約 100–300 token；`/todo init` 只跑一次，依專案大小而定。
