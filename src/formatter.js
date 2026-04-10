const { recommend } = require("./recommend");

// Format a permission prompt for Discord.
// Returns { embed, followUp } where embed is a Discord embed object
// and followUp is an optional plain-text terminal context string.
function formatPermissionPrompt(hookData, terminal, { timeoutSec } = {}) {
  const tool = hookData.tool_name || "Unknown tool";
  const input = hookData.tool_input || {};
  const project = projectName(hookData.cwd);

  // Build a readable summary of what the tool wants to do
  let inputLabel, inputValue;
  if (tool === "Bash") {
    inputLabel = "Command";
    inputValue = `\`\`\`\n${truncate(input.command || "(empty)", 500)}\n\`\`\``;
  } else if (tool === "Edit" || tool === "Write" || tool === "Read") {
    inputLabel = "File";
    inputValue = `\`${input.file_path || "(unknown)"}\``;
  } else if (tool === "Agent") {
    inputLabel = "Task";
    inputValue = truncate(input.prompt || input.description || "(no description)", 400);
  } else {
    inputLabel = "Input";
    inputValue = `\`\`\`json\n${truncate(JSON.stringify(input, null, 2), 500)}\n\`\`\``;
  }

  const rec = recommend(tool, input);

  const embed = {
    color: 0xffa500,
    title: "\u23f3 Claude needs approval",
    description: timeoutSec ? `Expires in ${Math.round(timeoutSec / 60)} min` : undefined,
    fields: [
      { name: "Tool", value: tool, inline: true },
      { name: "Project", value: project, inline: true },
      { name: inputLabel, value: inputValue },
      { name: "Recommended", value: rec },
    ],
    footer: {
      text: "1 \u2192 Allow once \u00b7 2 \u2192 Always allow \u00b7 3 \u2192 Deny \u00b7 or type feedback",
    },
  };

  const terminalBlock = formatTerminal(terminal, 6000, { skipAnchor: true });

  return { embed, followUp: terminalBlock || null };
}

// Format a question or plan-review prompt for Discord
function formatQuestion(hookData, terminal) {
  const toolName = hookData.tool_name;
  const project = projectName(hookData.cwd);

  let header, content;
  if (toolName === "ExitPlanMode") {
    header = `\u23f3 **Claude has a plan ready for review**`;
    content = "Claude finished planning and wants your approval. The plan is shown in the terminal context below.";
  } else {
    header = `\u23f3 **Claude has a question**`;
    content = hookData.tool_input?.question || "(no question text)";
  }

  const terminalBlock = formatTerminal(terminal);

  return [
    header,
    `**Project:** ${project}\n`,
    content,
    terminalBlock,
    `\nReply with a number or type your answer.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// Format an idle/task-complete notification for Discord
function formatIdle(hookData, terminal) {
  const project = projectName(hookData.cwd);
  const message = hookData.assistant_message || "";

  // Truncate Claude's last response to a readable summary
  const summary = truncate(message, 600);
  const terminalBlock = formatTerminal(terminal);

  return [
    `\u2705 **Claude is idle**`,
    `**Project:** ${project}\n`,
    summary
      ? `**Last response:**\n\`\`\`\n${summary}\n\`\`\``
      : "Claude finished and is waiting for input.",
    terminalBlock,
    `\nReply with your next instruction, or ignore until you\u2019re back.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// --- helpers ---

function projectName(cwd) {
  if (!cwd) return "(unknown)";
  return cwd.split("/").pop() || cwd;
}

function truncate(text, maxLen) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n... (truncated)";
}

function formatTerminal(terminal, maxChars, { skipAnchor } = {}) {
  if (!terminal) return "";
  const MAX_CHARS = maxChars || 1600;
  // Strip trailing blank lines before truncation
  const raw = terminal.replace(/\n+$/, "");
  const allLines = raw.split("\n").filter((line) => !isChromeLine(line));
  // Anchor from the last user-prompt line if one exists
  let anchorIdx = -1;
  if (!skipAnchor) {
    for (let i = allLines.length - 1; i >= 0; i--) {
      if (/^❯ \S/.test(allLines[i])) { anchorIdx = i; break; }
    }
  }
  const lines = anchorIdx >= 0 ? allLines.slice(anchorIdx) : allLines;
  const hasAnchor = anchorIdx >= 0 && lines.length > 1;
  // Reserve the anchor prompt line so it is never dropped
  const anchorLine = hasAnchor ? lines[0] : null;
  const anchorCost = anchorLine ? anchorLine.length + 1 : 0; // +1 for "\n" separator
  const tailLines = hasAnchor ? lines.slice(1) : lines;
  const budget = Math.max(0, MAX_CHARS - anchorCost);
  const kept = [];
  let total = 0;
  for (let i = tailLines.length - 1; i >= 0; i--) {
    const added = (kept.length > 0 ? 1 : 0) + tailLines[i].length;
    if (total + added > budget) break;
    kept.push(tailLines[i]);
    total += added;
  }
  kept.reverse();
  if (anchorLine) kept.unshift(anchorLine);
  const trimmed = kept.join("\n");
  return `\n**Terminal context:**\n\`\`\`\n${trimmed}\n\`\`\``;
}

// Filter low-value UI chrome lines from terminal output.
// Keeps real content: commands, tool output, errors, approval choices.
function isChromeLine(line) {
  const trimmed = line.trim();
  // Empty prompt with no command (but keep "❯ <command>")
  if (trimmed === "❯") return true;
  // Spinner/status lines (✽, ✻, ✢, ✶ prefixes)
  if (/^[✽✻✢✶]/.test(trimmed)) return true;
  // Tip lines
  if (trimmed.startsWith("⎿ Tip:")) return true;
  // Horizontal separators (lines of mostly ─)
  if (/^─{4,}$/.test(trimmed)) return true;
  // Footer hint lines (e.g. "esc to interrupt", "Esc to cancel · Tab to amend · ctrl+e to explain")
  if (/^esc\s+to\s+/i.test(trimmed)) return true;
  return false;
}

// Format an on-demand status snapshot for Discord
function formatStatus(terminal, pendingType) {
  const hasPending = pendingType && pendingType !== "none";
  const terminalBlock = formatTerminal(terminal);
  return [
    `\ud83d\udcfa **Claude status**`,
    `**Pending bridge prompt:** ${hasPending ? "yes" : "no"}`,
    `**Pending type:** ${pendingType || "none"}`,
    terminalBlock || "No terminal content available.",
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = { formatPermissionPrompt, formatQuestion, formatIdle, formatStatus };
