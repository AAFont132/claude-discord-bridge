const { execSync } = require("child_process");

const SESSION = process.env.CLAUDE_TMUX_SESSION || "claude";

// Check if the configured tmux session exists
function sessionExists() {
  try {
    execSync(`tmux has-session -t ${SESSION}`, { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Capture the last N lines of the tmux pane content
function capturePane(lines = 80) {
  try {
    return execSync(`tmux capture-pane -t ${SESSION} -p -S -${lines}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    }).trim();
  } catch (err) {
    console.error(`[tmux] Failed to capture pane: ${err.message}`);
    return null;
  }
}

// Type text into the tmux session and press Enter
function sendKeys(text) {
  // Normalize to single line — multi-line Discord messages become one line
  const singleLine = text.replace(/\n/g, " ").trim();
  if (!singleLine) return false;

  // Escape single quotes for the bash shell wrapper
  const escaped = singleLine.replace(/'/g, "'\\''");

  try {
    // -l flag sends literal characters (won't interpret "C-c" as Ctrl+C, etc.)
    execSync(`tmux send-keys -t ${SESSION} -l '${escaped}'`, {
      stdio: "pipe",
      timeout: 5000,
    });
    // Press Enter separately (not literal — we want the actual Enter key)
    execSync(`tmux send-keys -t ${SESSION} Enter`, {
      stdio: "pipe",
      timeout: 5000,
    });
    return true;
  } catch (err) {
    console.error(`[tmux] Failed to send keys: ${err.message}`);
    return false;
  }
}

module.exports = { sessionExists, capturePane, sendKeys };
