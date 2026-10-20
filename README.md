# todo-panel

[繁體中文](README.zh-TW.md)

A project-level To Do panel for Claude Code.

Claude Code's built-in task list answers "what steps are we doing in this session?" and disappears when the session ends. todo-panel covers the other layer: **what is still left to do in the whole project, and which questions are waiting on you**. The list lives in your project as `.claude/todo-panel.md`: plain Markdown, hand-editable, and fine to commit. It persists across sessions, and Claude maintains it and keeps it in priority order. Tasks left open in the built-in list are folded in automatically.

## What the panel looks like

The panel opens in a side pane next to Claude Code and has two sections:

```text
To Do                                      ✕
Prioritized by Claude

Pending Decisions (2)
? Should login use OAuth or an email code?
    Blocks: Implement the login flow
? Should reports support PDF export?
Type /decide-questions and Claude will ask about each decision in turn.

Backlog (3)
1. Implement the login flow
    Can start as soon as the login method is decided
2. Add integration tests for the API
    Biggest test gap after the last round of changes
3. Update the deployment docs
    Low risk, can be done any time
```

- **Pending Decisions** are questions only you can answer. Each one can note which task it blocks; once you decide, that task is unblocked.
- **Backlog** holds work that has been agreed but not done. Items are tasks, not small steps, listed in the order Claude recommends, each with a one-line reason for its place.
- Click a task title and the input box is filled with that task's name; press send and Claude starts on it.
- To reorder, add, or remove items, just tell Claude.

## Install

Requires Claude Code 2.1.287 or later (check with `claude --version`, update with `claude update`).

**Option 1: terminal**

```bash
claude plugin marketplace add mingfeng6684/claude-todo-panel
claude plugin install todo-panel@todo-panel-local
```

**Option 2: inside a Claude Code session**

```text
/plugin install todo-panel --marketplace mingfeng6684/claude-todo-panel
```

When it asks `Add marketplace?`, answer `y` and pick the user scope.

**Option 3: Claude desktop app** (`/plugin` is not available in the app)

Click **+** next to the input box → **Plugins** → **Add marketplace**, enter `mingfeng6684/claude-todo-panel`, then **Add plugin**.

After installing, start a new session, or type `/reload-plugins` in an existing one.

## Getting started

The first time you use it in a project, run:

```text
/todo init
```

Claude first detects the plan documents and skills in your project (for example `docs/`, `plans/`, superpowers plans, PRDs, TODO/FIXME comments) and uses a menu to ask which sources to build the list from. After reading them it **shows you a proposed list and waits for your confirmation** before writing anything, so it won't make up tasks. If the project has nothing to read, that's fine: Claude asks what the project is for and what you want done next, and drafts a starting list from your answers and the code itself.

Once the project has a list, the panel opens automatically at the start of every session; you don't need to run a command again.

Commands:

| Command | What it does |
|---|---|
| `/todo show` | Open the panel |
| `/todo hide` | Close the panel (or click its close button). After closing, it won't pop up again automatically in this session; `/todo show` brings it back any time |
| `/decide-questions` | Claude lists all pending decisions, then asks about them one at a time with multiple-choice options. After each answer, the decision is removed, the task list is updated, and Claude tells you which tasks were unblocked |

## How the list stays current

You never have to tidy the list by hand. Finished items disappear on their own:

1. **Done or decided:** when a task is finished or you make a decision, Claude removes the item directly.
2. **Built-in task list sync:** tasks Claude creates in the built-in task list during a session are merged into the Backlog when a turn ends, and removed once they are marked completed.
3. **Plan document sync:** for items that were pulled in from a plan file (such as `docs/plans/auth.md`), ticking the item `- [x]` in that file makes it disappear from the panel.
4. **Hand edits work too:** edit `.claude/todo-panel.md` directly and the panel updates within a few seconds. Changing an item to `- [x]` counts as done and removes it.

## The data is one Markdown file

`.claude/todo-panel.md` looks like this, and the header says it's safe to edit by hand:

```markdown
<!-- todo-panel: kept by the todo-panel mod; safe to edit by hand -->
# To Do

## Sources
- docs/plans/

## Pending Decisions
- [ ] Should login use OAuth or an email code? <!-- id:d1 blocks:t1 -->

## Backlog
- [ ] Implement the login flow <!-- id:t1 src:docs%2Fplans%2Fauth.md -->
  - Can start as soon as the login method is decided
- [ ] Add integration tests for the API <!-- id:t2 -->
  - Biggest test gap after the last round of changes
```

The `id`, `blocks`, and `src` values in the comments are metadata the panel keeps for itself, and you can ignore them: a missing `id` is filled in automatically, and `blocks` and `src` are optional. The indented line under a task is its reason ("why"). Commit the file to your repo and the whole team, and every session, sees the same list.

## Panel language

English, Traditional Chinese (繁體中文), and Japanese (日本語) are supported. The setting defaults to `auto`, which uses the first of these that it finds:

1. The todo-panel language option in `/config` (`zh-TW` / `en` / `ja`)
2. The `language` setting in Claude Code
3. The interface language chosen in the Claude desktop app
4. The system environment variables (`LC_ALL` / `LC_MESSAGES` / `LANG`)

If none of them gives a supported language, English is used.

## Access

Everything runs locally; the mod makes no network requests and runs no external commands.

- **Reads and writes** `.claude/todo-panel.md` in your project — the list itself.
- **Reads** the plan documents you chose in `/todo init`, to drop items that are ticked `- [x]` there.
- **Reads** Claude Code settings, the Claude desktop app's `config.json`, and the `LC_ALL` / `LC_MESSAGES` / `LANG` environment variables — only to pick the panel language.
- **Registers** one tool (`mcp__todo-panel__update`) and two commands for Claude, and observes the built-in task-list tools to fold session tasks into the Backlog.

## Token usage

Showing the panel, click-to-fill, and file syncing all run locally and **cost no tokens**. Tokens are only used for:

- about 300–600 tokens of tool description added to each request (this part is cached);
- about 100–300 tokens each time Claude adds or updates an item;
- `/todo init`, which runs once; the cost depends on how much documentation your project has.
