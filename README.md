# todo-panel

[English](README.en.md)

Claude Code 的專案層級 To Do 面板。

Claude Code 內建的任務清單是「這次 session 做哪些步驟」，session 結束就沒了。todo-panel 補的是另一層：**整個專案還有哪些事要做、哪些問題等你決定**。清單存在專案裡的 `.claude/todo-panel.md`（純 Markdown，可手改、可進版控），跨 session 存在，由 Claude 維護並排優先序——內建清單裡沒做完的任務也會自動併進來。

## 面板長什麼樣

面板分兩區，開在 Claude Code 側邊：

```text
To Do                                      ✕
依 Claude 建議優先序

待決策事項 (2)
? 登入要用 OAuth 還是 Email 驗證碼？
    阻塞：實作登入流程
? 報表要不要支援匯出 PDF？
輸入 /decide-questions，Claude 會逐項提出決策問題。

待執行任務 (3)
1. 實作登入流程
    等登入方式決定後就能動工
2. 補 API 的整合測試
    上次改動後測試缺口最大的地方
3. 更新部署文件
    低風險，隨時可做
```

- **待決策事項**：只有你能回答的問題。每項可以標注它卡住哪個任務，決定之後任務就解鎖。
- **待執行任務**：講好但還沒做的工作，任務層級（不是零碎步驟），照 Claude 建議的優先序排列，每項附一行「為什麼排這裡」。
- 點任務標題，輸入框會填入該任務名稱，按送出 Claude 就開始做。
- 想調整順序或增刪項目，直接跟 Claude 說。

## 安裝

需要 Claude Code 2.1.287 以上（`claude --version` 查看，`claude update` 更新）。

**方式一：終端機**

```bash
claude plugin marketplace add mingfeng6684/claude-todo-panel
claude plugin install todo-panel@todo-panel-local
```

**方式二：Claude Code session 裡**

```text
/plugin install todo-panel --marketplace mingfeng6684/claude-todo-panel
```

出現 `Add marketplace?` 時回答 `y`，範圍選 user。

**方式三：Claude 桌面 App**（App 裡不能用 `/plugin`）

點輸入框旁的 **+** → **Plugins** → **Add marketplace**，輸入 `mingfeng6684/claude-todo-panel`，再 **Add plugin**。

裝好後開新的 session，或在既有 session 輸入 `/reload-plugins`。

## 開始使用

第一次在專案裡用，先跑：

```text
/todo init
```

Claude 會先偵測專案裡的計畫文件和你用的 skills（例如 `docs/`、`plans/`、superpowers 的計畫、PRD、TODO 註解），用選單問你要從哪些來源整理，讀完後**先列出建議清單給你確認**才寫入——不會自己亂編任務。專案裡什麼都沒有也沒關係，Claude 會改問你這個專案想做什麼，從頭幫你列。

設定好之後，只要專案裡有這份清單，每次開 session 面板都會自動打開，不必再輸入指令。

之後的指令：

| 指令 | 做什麼 |
|---|---|
| `/todo show` | 開啟面板 |
| `/todo hide` | 關閉面板（或點面板的關閉鈕）。關掉後這次 session 不會再自動跳出，`/todo show` 隨時叫回來 |
| `/decide-questions` | Claude 列出所有待決策事項，一題一題用選項問你；每答完一題就移除該事項、更新任務清單，並告訴你哪些任務解鎖了 |

## 清單怎麼保持最新

你不用手動清單子，做完的事會自己消失：

1. **Claude 做完或你決定後**，Claude 直接把該項移除。
2. **內建任務清單同步**：Claude 在這次 session 開的任務，回合結束時自動併入待執行任務；做完的自動移除。
3. **計畫文件同步**：從某份計畫（如 `docs/plans/auth.md`）整理進來的項目，原文件裡打勾 `- [x]` 後，面板上的對應項目就消失。
4. **手改也通**：直接編輯 `.claude/todo-panel.md`，面板幾秒內更新；把項目勾成 `- [x]` 等同完成移除。

## 資料就是一份 Markdown

`.claude/todo-panel.md` 長這樣，檔頭就寫明可以手改：

```markdown
<!-- todo-panel: kept by the todo-panel mod; safe to edit by hand -->
# To Do

## Sources
- docs/plans/

## Pending Decisions
- [ ] 登入要用 OAuth 還是 Email 驗證碼？ <!-- id:d1 blocks:t1 -->

## Backlog
- [ ] 實作登入流程 <!-- id:t1 src:docs%2Fplans%2Fauth.md -->
  - 等登入方式決定後就能動工
- [ ] 補 API 的整合測試 <!-- id:t2 -->
  - 上次改動後測試缺口最大的地方
```

註解裡的 `id` / `blocks` / `src` 是面板自己記的 metadata，不想管它也沒關係——`id` 漏了會自動補，`blocks` 和 `src` 本來就是選填。把這個檔 commit 進 repo，整個團隊和每個 session 看到的就是同一份清單。

## 面板語言

支援繁體中文、English、日本語。預設 `auto`，依序採用第一個找到的設定：

1. `/config` 裡 todo-panel 的 language 選項（zh-TW / en / ja）
2. Claude Code 設定的 `language`
3. Claude 桌面 App 選的介面語言
4. 系統環境變數（`LC_ALL` / `LC_MESSAGES` / `LANG`）

都沒有就用英文。

## Token 用量

面板顯示、點擊填入、檔案同步都在本機執行，**不花 token**。會用到 token 的只有：

- 每次請求多帶約 300–600 token 的工具說明（會被快取）；
- Claude 新增或更新一筆項目約 100–300 token；
- `/todo init` 只跑一次，花費依專案文件多寡而定。
