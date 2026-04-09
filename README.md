# Claude Discord Bridge

A local tool that bridges Claude Code's terminal prompts to Discord, so you can approve tool calls, answer questions, and send instructions from your phone while away from your PC.

## How it works

1. Claude Code runs inside a **tmux** session on your machine
2. Claude Code's **hook system** fires events when it needs permission, asks a question, or finishes a task
3. The hooks call a shell script that POSTs the event data (+ terminal context) to a local HTTP server
4. The bridge bot formats the data and sends it to a **Discord channel**
5. You reply on Discord from your phone
6. For permission prompts: the bot returns your allow/deny decision to Claude Code via the hook response
7. For questions and instructions: the bot types your reply into Claude's tmux session
8. You can also send `status` in Discord to get the current visible Claude screen without sending anything into tmux

```
Claude Code ─── hook ──→ bridge.sh ──→ HTTP server ──→ Discord bot ──→ Discord channel
                                                                            │
                                        tmux send-keys ←── Discord bot ←───┘
                                              │                (your reply)
                                              ▼
                                         Claude Code
                                       (receives input)
```

## Prerequisites

- **Node.js** 18 or later
- **tmux** (installed by default on most Linux/WSL systems — run `tmux -V` to check)
- **jq** (for the hook script — install with `sudo apt install jq`)
- **curl** (usually pre-installed)
- A **Discord bot** (setup steps below)

## Discord bot setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, give it a name (e.g., "Claude Bridge")
3. Go to **Bot** tab → click **Reset Token** → copy the token (this is your `DISCORD_TOKEN`)
4. Under **Privileged Gateway Intents**, enable **Message Content Intent**
5. Go to **OAuth2** tab → **URL Generator**
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`
6. Copy the generated URL, open it in your browser, and add the bot to your server
7. In Discord, right-click the channel you want to use → **Copy Channel ID** (this is your `DISCORD_CHANNEL_ID`)
8. Right-click your own name → **Copy User ID** (this is your `DISCORD_USER_ID`)

> **Note:** You need Developer Mode enabled in Discord to see "Copy ID" options. Enable it in Discord Settings → App Settings → Advanced → Developer Mode.

## Installation

```bash
cd ~/projects/claude-discord-bridge
npm install
cp .env.example .env
# Edit .env with your Discord token, channel ID, and user ID
```

## Configuration (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | — | Bot token from Discord Developer Portal |
| `DISCORD_CHANNEL_ID` | Yes | — | Channel where the bot posts prompts |
| `DISCORD_USER_ID` | Yes | — | Your Discord user ID (only you can respond) |
| `CLAUDE_TMUX_SESSION` | No | `claude` | Name of the tmux session running Claude |
| `BRIDGE_PORT` | No | `8787` | Port for the local HTTP server |
| `PERMISSION_TIMEOUT` | No | `300` | Seconds to wait for permission replies before auto-deny |

## How to start Claude in tmux

Before starting the bridge, Claude Code must be running inside a tmux session:

```bash
# Start a new tmux session named "claude"
tmux new-session -s claude

# Inside the tmux session, start Claude Code
claude

# To detach from tmux without stopping Claude: press Ctrl+B, then D
# To reattach later: tmux attach -t claude
```

## Claude Code hook configuration

Add this to your Claude Code settings. You can use either:
- `~/.claude/settings.json` (applies to all projects)
- `your-project/.claude/settings.local.json` (applies to one project)

Replace `/path/to` with the actual path to this repo (e.g., `/home/ariel_/projects`):

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/claude-discord-bridge/hooks/bridge.sh",
            "timeout": 600
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion|ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/claude-discord-bridge/hooks/bridge.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/claude-discord-bridge/hooks/bridge.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

> **Important:** The `PermissionRequest` hook is intentionally blocking (no `async` flag) with a long timeout. This is what allows the bridge to wait for your Discord reply before telling Claude to proceed or stop. The `PreToolUse` and `Stop` hooks respond immediately — they just send notifications.

## Running the bridge

```bash
cd ~/projects/claude-discord-bridge
npm start
```

You should see:
```
[bridge] HTTP server listening on http://127.0.0.1:8787
[bridge] Discord connected
[bridge] Ready.
```

And in Discord, the bot posts: **Bridge online**

> **Important:** Restart the bridge after changing bridge code. Otherwise Discord may still show old behavior from the previously running Node process.

## Responding from Discord

### Permission prompts

When Claude needs tool approval, you'll see a message like:

> **Claude needs approval** (expires in 5 min)
> **Tool:** Bash
> **Command:** `git push origin main`
> **Recommended:** Pushes code to the remote repo. Approve if you've verified the changes.

Reply with:
- `1` — allow once
- `2` — allow once and add a session-scoped allow rule for future matching requests (for Write/Edit/Read, the rule is scoped to the current project directory)
- `3` — deny
- Any other text — deny with your text as the reason sent to Claude

> **Note:** The “always allow” option is session-scoped for the current Claude/tmux run. It allows the current request and adds a temporary allow rule for later matching requests in that session. It is not a permanent global allow.

### Questions

When Claude asks a question with numbered options, reply with the matching number or type your answer.

### Idle notifications

When Claude finishes a task or pauses waiting for input, you'll see a summary plus terminal context from the current Claude screen. This helps with follow-up questions that appear in the terminal but are not permission prompts. Reply with your next instruction, or ignore it.

### Status and repo commands

Send these exact messages in Discord:

- `status` — returns the current visible Claude screen without sending anything into Claude's terminal
- `gitstatus` — returns `git status` for the current repo without sending anything into Claude's terminal
- `gitlog` — returns `git log --oneline -5` for the current repo without sending anything into Claude's terminal

## V1 features

- Permission prompt relay with allow once / session-scoped allow / deny from Discord
- Permission prompts show the timeout window in the header (e.g., expires in 5 min)
- Question and plan-review relay
- Idle/task-complete notifications with response summary
- Numbered choice support
- Free-text replies sent to Claude's terminal
- Recommended action summaries in plain English
- Idle/task-complete messages include terminal context from the current Claude screen
- Terminal context strips trailing blank lines before truncation
- Terminal context preserves the last `❯ ` prompt anchor at the top when truncating
- Terminal context budget is 1600 characters (up from 1200)
- Terminal context favors the most recent visible output
- Exact `status` command in Discord returns the current visible Claude screen on demand
- Exact `gitstatus` and `gitlog` commands in Discord return safe repo status output on demand
- Stray numeric replies like `1`, `2`, or `3` are blocked when no bridge prompt is pending
- Copy-friendly formatting (code blocks)
- Fail-closed: timeouts and failures default to deny/wait
- Single authorized user only

## V1 does NOT support

- File uploads
- Arbitrary command execution from Discord
- Autonomous task launching from Discord
- Multiple users
- Multiple concurrent Claude sessions
- Internal/hidden reasoning capture
- Web dashboard
- Cloud deployment (local only)
- Persistent audit log
- Discord slash commands or interactive buttons

## Fail-safe behavior

| Failure | What happens |
|---------|-------------|
| Bridge not running | Permission hooks deny. Other hooks silently continue. |
| Discord down | Permission hooks deny with error. Notifications lost. |
| No reply (timeout) | Permission hooks auto-deny after timeout. Questions just wait. |
| Bot crashes | Permission hooks deny. Claude waits for local terminal input. |
| Wrong tmux session | Bot refuses to start. |

**Core principle:** If anything goes wrong, nothing is approved. Claude either gets a denial or keeps waiting for local terminal input.

## Troubleshooting

**Bot says "Channel not found"** — Check that `DISCORD_CHANNEL_ID` is correct and the bot has access to that channel.

**Bot says "tmux session not found"** — Start Claude in tmux first: `tmux new-session -s claude`

**Hook doesn't fire** — Check that `settings.json` has the correct path to `bridge.sh` and that the file is executable (`chmod +x hooks/bridge.sh`).

**Permission always denied** — Make sure the bridge is running (`npm start`) before the hook fires. Check that `BRIDGE_PORT` matches in both `.env` and the hook script's environment.

**`gitstatus` or `gitlog` still triggers Claude instead of returning output in Discord** — Restart the bridge after pulling or editing bridge code. New Discord command shortcuts are not live until the running bridge process is restarted.

**I replied `1`, `2`, or `3` in Discord and nothing happened** — If there is no pending permission/question prompt, the bot will not inject stray numeric replies into Claude. Wait for a new bridge prompt, or send `status` to see the current screen.

**"Not authorized" in Discord** — Only the user matching `DISCORD_USER_ID` can respond. Check the ID.
