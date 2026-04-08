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
    `\`1\` \u2192 Approve  \u00b7  \`2\` \u2192 Deny`,
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
function formatIdle(hookData) {
  const project = projectName(hookData.cwd);
  const message = hookData.assistant_message || "";

  // Truncate Claude's last response to a readable summary
  const summary = truncate(message, 600);

  return [
    `\u2705 **Claude is idle**`,
    `**Project:** ${project}\n`,
    summary
      ? `**Last response:**\n\`\`\`\n${summary}\n\`\`\``
      : "Claude finished and is waiting for input.",
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
  // Keep the last 30 lines to stay within Discord's message limits
  const lines = terminal.split("\n");
  const trimmed =
    lines.length > 30
      ? lines.slice(-30).join("\n")
      : terminal;
  return `\n**Terminal context:**\n\`\`\`\n${truncate(trimmed, 800)}\n\`\`\``;
}

module.exports = { formatPermissionPrompt, formatQuestion, formatIdle };
