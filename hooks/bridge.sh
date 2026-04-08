#!/usr/bin/env bash
# Claude Discord Bridge — Hook Script
#
# Called by Claude Code hooks. Reads the hook event JSON from stdin,
# captures the current tmux terminal context, and POSTs both to the
# bridge bot's local HTTP server.
#
# For PermissionRequest hooks (blocking): the bridge server holds the
# request until a Discord reply arrives, then returns the allow/deny
# decision. This script echoes that response to stdout for Claude Code.
#
# For all other hooks (async): the bridge server responds immediately.
# Claude Code doesn't wait for async hooks to finish.
#
# FAIL-SAFE: If the bridge is unavailable, PermissionRequest hooks
# exit 2 (= deny). All other hooks exit 0 (= continue silently).

set -uo pipefail

BRIDGE_PORT="${BRIDGE_PORT:-8787}"
CLAUDE_TMUX_SESSION="${CLAUDE_TMUX_SESSION:-claude}"

# Read hook JSON from stdin
INPUT=$(cat)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null || echo "")

# Capture terminal context from the tmux pane (last 80 lines)
TERMINAL=""
if tmux has-session -t "$CLAUDE_TMUX_SESSION" 2>/dev/null; then
  TERMINAL=$(tmux capture-pane -t "$CLAUDE_TMUX_SESSION" -p -S -80 2>/dev/null || echo "")
fi

# Build combined payload
PAYLOAD=$(jq -n \
  --argjson hook "$INPUT" \
  --arg terminal "$TERMINAL" \
  '{hook: $hook, terminal: $terminal}' 2>/dev/null)

if [ -z "$PAYLOAD" ]; then
  # Couldn't build payload (malformed input?)
  if [ "$EVENT" = "PermissionRequest" ]; then
    echo "Malformed hook input — denying for safety" >&2
    exit 2
  fi
  exit 0
fi

# POST to bridge server
# -s: silent (no progress bar)
# -f: fail on HTTP errors
# -m 600: 10-minute timeout (permission prompts can take a while)
RESPONSE=$(curl -s -f -m 600 -X POST \
  "http://127.0.0.1:${BRIDGE_PORT}/hook" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" 2>/dev/null) || {
  # Bridge unavailable — fail safe
  if [ "$EVENT" = "PermissionRequest" ]; then
    echo "Bridge unavailable — denying for safety" >&2
    exit 2
  fi
  exit 0
}

# Output response for Claude Code (only matters for blocking hooks)
if [ -n "$RESPONSE" ]; then
  echo "$RESPONSE"
fi

exit 0
