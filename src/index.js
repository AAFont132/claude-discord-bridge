require("dotenv").config();

const { createServer } = require("./server");
const discord = require("./discord");
const { formatPermissionPrompt, formatQuestion, formatIdle } = require("./formatter");
const tmux = require("./tmux");

// --- Configuration ---

const PORT = parseInt(process.env.BRIDGE_PORT || "8787", 10);
const TIMEOUT_MS = parseInt(process.env.PERMISSION_TIMEOUT || "300", 10) * 1000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SESSION_NAME = process.env.CLAUDE_TMUX_SESSION || "claude";

// --- Startup validation ---

function validateConfig() {
  const missing = [];
  if (!DISCORD_TOKEN) missing.push("DISCORD_TOKEN");
  if (!process.env.DISCORD_CHANNEL_ID) missing.push("DISCORD_CHANNEL_ID");
  if (!process.env.DISCORD_USER_ID) missing.push("DISCORD_USER_ID");

  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    console.error("Copy .env.example to .env and fill in the values.");
    process.exit(1);
  }

  if (!tmux.sessionExists()) {
    console.error(`tmux session "${SESSION_NAME}" not found.`);
    console.error("Start Claude Code in a tmux session first:");
    console.error(`  tmux new-session -s ${SESSION_NAME}`);
    console.error("  claude");
    process.exit(1);
  }
}

// --- Pending permission state (one at a time) ---

let pendingPermission = null;

// --- Discord reply handler ---

function handleReply(text) {
  if (pendingPermission) {
    // There's a permission prompt waiting — interpret the reply as allow/deny
    const { resolve, hook } = pendingPermission;
    pendingPermission = null;

    let decision;
    if (text === "1" || /^y(es)?$/i.test(text)) {
      decision = { behavior: "allow" };
      console.log("[bridge] Permission APPROVED (once) via Discord");
    } else if (text === "2" || /^a(lways)?$/i.test(text)) {
      const toolName = hook?.tool_name || "Bash";
      decision = {
        behavior: "allow",
        updatedPermissions: [{
          type: "addRules",
          rules: [{ toolName, ruleContent: "*" }],
          behavior: "allow",
          destination: "session",
        }],
      };
      console.log(`[bridge] Permission APPROVED (always, session) for ${toolName} via Discord`);
    } else if (text === "3" || /^n(o)?$/i.test(text)) {
      decision = { behavior: "deny", reason: "Denied via Discord" };
      console.log("[bridge] Permission DENIED via Discord");
    } else {
      // Free text = deny with the text as the reason
      decision = { behavior: "deny", reason: text };
      console.log(`[bridge] Permission DENIED with feedback: ${text}`);
    }

    resolve({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision,
      },
    });
  } else {
    // No pending permission — send the text to Claude's terminal via tmux
    const sent = tmux.sendKeys(text);
    if (sent) {
      console.log(`[bridge] Sent to tmux: ${text}`);
    } else {
      console.error("[bridge] Failed to send to tmux");
      discord
        .sendMessage("Failed to send to Claude's terminal. Is the tmux session still running?")
        .catch(() => {});
    }
  }
}

// --- Main ---

async function main() {
  validateConfig();

  // Wire up Discord reply handler
  discord.onReply(handleReply);

  // Create HTTP server with event handlers
  const app = createServer({
    // Permission prompts: BLOCK until Discord reply or timeout
    onPermission: async (hook, terminal) => {
      const msg = formatPermissionPrompt(hook, terminal);
      await discord.sendMessage(msg);

      return new Promise((resolve) => {
        const thisRequest = { resolve, hook };
        pendingPermission = thisRequest;

        // Auto-deny on timeout
        setTimeout(() => {
          if (pendingPermission === thisRequest) {
            pendingPermission = null;
            console.log("[bridge] Permission TIMED OUT — auto-deny");

            resolve({
              hookSpecificOutput: {
                hookEventName: "PermissionRequest",
                decision: {
                  behavior: "deny",
                  reason: "Timed out — no response from Discord",
                },
              },
            });

            discord
              .sendMessage("\u23f0 Permission prompt timed out. Tool was denied.")
              .catch(() => {});
          }
        }, TIMEOUT_MS);
      });
    },

    // Questions and plan reviews: notify Discord, respond to HTTP immediately
    onQuestion: async (hook, terminal) => {
      const msg = formatQuestion(hook, terminal);
      await discord.sendMessage(msg);
    },

    // Task complete / idle: notify Discord
    onStop: async (hook) => {
      const msg = formatIdle(hook);
      await discord.sendMessage(msg);
    },
  });

  // Start HTTP server
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[bridge] HTTP server listening on http://127.0.0.1:${PORT}`);
  });

  // Connect to Discord
  try {
    await discord.start(DISCORD_TOKEN);
    console.log("[bridge] Discord connected");
    await discord.sendMessage(
      `\u{1f6dc} **Bridge online**\nListening for Claude Code hooks on port ${PORT}.\ntmux session: \`${SESSION_NAME}\``
    );
  } catch (err) {
    console.error(`[bridge] Discord connection failed: ${err.message}`);
    console.error("Check your DISCORD_TOKEN and bot permissions.");
    process.exit(1);
  }

  console.log("[bridge] Ready.");
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[bridge] Shutting down...");

  // Deny any pending permission
  if (pendingPermission) {
    pendingPermission.resolve({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "deny", reason: "Bridge shutting down" },
      },
    });
    pendingPermission = null;
  }

  await discord.destroy();
  process.exit(0);
});

main().catch((err) => {
  console.error(`[bridge] Fatal: ${err.message}`);
  process.exit(1);
});
