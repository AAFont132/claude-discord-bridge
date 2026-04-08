const express = require("express");

// Create the HTTP server that receives Claude Code hook POSTs.
// Callbacks handle each event type — the server doesn't know about
// Discord or tmux; it just routes events to the right handler.
function createServer({ onPermission, onQuestion, onStop }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/hook", async (req, res) => {
    try {
      const { hook, terminal } = req.body || {};

      if (!hook || !hook.hook_event_name) {
        res.json({});
        return;
      }

      const event = hook.hook_event_name;

      if (event === "PermissionRequest") {
        // Blocking — waits for Discord reply before responding
        const result = await onPermission(hook, terminal);
        res.json(result);
      } else if (
        event === "PreToolUse" &&
        (hook.tool_name === "AskUserQuestion" || hook.tool_name === "ExitPlanMode")
      ) {
        // Async — notify Discord, respond immediately
        onQuestion(hook, terminal).catch((err) => {
          console.error(`[server] Error in onQuestion: ${err.message}`);
        });
        res.json({});
      } else if (event === "Stop") {
        // Async — notify Discord, respond immediately
        onStop(hook, terminal).catch((err) => {
          console.error(`[server] Error in onStop: ${err.message}`);
        });
        res.json({});
      } else {
        // Unknown event — ignore
        res.json({});
      }
    } catch (err) {
      console.error(`[server] Error handling hook: ${err.message}`);

      // Fail closed for permission requests
      if (req.body?.hook?.hook_event_name === "PermissionRequest") {
        res.json({
          hookSpecificOutput: {
            hookEventName: "PermissionRequest",
            decision: {
              behavior: "deny",
              reason: "Bridge error: " + err.message,
            },
          },
        });
      } else {
        res.json({});
      }
    }
  });

  return app;
}

module.exports = { createServer };
