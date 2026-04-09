const { recommend } = require("./recommend");

// Format a permission prompt for Discord
function formatPermissionPrompt(hookData, terminal) {
  const tool = hookData.tool_name || "Unknown tool";
  const input = hookData.tool_input || {};
  const project = projectName(hookData.cwd);

  // Build a readable summary of what the tool wants to do
  let inputSummary = "";
  if (tool === "Bash") {
    inputSummary = `**Command:**\n\`\`\`\n${truncate(input.command || "(empty)", 500)}\n\`\`\``;
  } else if (tool === "Edit" || tool === "Write" || tool === "Read") {
    inputSummary = `**File:** \`${input.file_path || "(unknown)"}\``;
  } else if (tool === "Agent") {
    inputSummary = `**Task:** ${truncate(input.prompt || input.description || "(no description)", 400)}`;
  } else {
    inputSummary = `**Input:**\n\`\`\`json\n${truncate(JSON.stringify(input, null, 2), 500)}\n\`\`\``;
  }

  const rec = recommend(tool, input);
  const terminalBlock = formatTerminal(terminal);

  return [
    `\u23f3 **Claude needs approval**\n`,
    `**Tool:** ${tool}`,
    `**Project:** ${project}\n`,
    inputSummary,
    terminalBlock,
    `\n\ud83d\udca1 **Recommended:** ${rec}\n`,
    `**Reply with:**`,
    `\`1\` \u2192 Allow once  \u00b7  \`2\` \u2192 Always allow  \u00b7  \`3\` \u2192 Deny`,
    `Or type feedback (denies + sends your reason to Claude)`,
  ]
    .filter(Boolean)
    .join("\n");
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

function formatTerminal(terminal) {
  if (!terminal) return "";
  const MAX_CHARS = 1200;
  // Strip trailing blank lines before truncation
  const raw = terminal.replace(/\n+$/, "");
  const allLines = raw.split("\n");
  // Anchor from the last user-prompt line if one exists
  let anchorIdx = -1;
  for (let i = allLines.length - 1; i >= 0; i--) {
    if (allLines[i].startsWith("❯ ")) { anchorIdx = i; break; }
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
