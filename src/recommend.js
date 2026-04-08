// Generates a plain-English recommended action for a tool call.
// Simple pattern matching — not AI-generated.

function recommend(toolName, toolInput) {
  if (!toolName) return "Review before approving.";

  if (toolName === "Bash") {
    const cmd = (toolInput?.command || "").trim();
    if (cmd.startsWith("git push"))
      return "Pushes code to the remote repo. Approve if you've verified the changes.";
    if (cmd.startsWith("git reset --hard"))
      return "Destructive — discards uncommitted changes permanently. Deny unless you are sure.";
    if (cmd.startsWith("git checkout") && cmd.includes("--"))
      return "May discard local file changes. Review carefully.";
    if (/^rm\s+-r/.test(cmd))
      return "Deletes files or folders. Verify the target path before approving.";
    if (cmd.startsWith("npm install") || cmd.startsWith("npm ci"))
      return "Installs dependencies. Generally safe to approve.";
    if (cmd.startsWith("npm test") || cmd.startsWith("npm run test"))
      return "Runs tests. Safe to approve.";
    if (cmd.startsWith("npm run"))
      return "Runs an npm script. Check which script before approving.";
    if (cmd.startsWith("docker"))
      return "Docker command. Review what containers/images are affected.";
    if (cmd.startsWith("curl") || cmd.startsWith("wget"))
      return "Network request. Check the URL before approving.";
    if (cmd.startsWith("mkdir"))
      return "Creates a directory. Safe to approve.";
    if (cmd.startsWith("cp "))
      return "Copies files. Check source and destination.";
    if (cmd.startsWith("mv "))
      return "Moves/renames files. Check source and destination.";
    return "Shell command. Review before approving.";
  }

  if (toolName === "Edit")
    return "Edits an existing file. Low risk — check the file path.";
  if (toolName === "Write")
    return "Creates or overwrites a file. Check the file path.";
  if (toolName === "Read")
    return "Reads a file. Safe to approve.";
  if (toolName === "Glob")
    return "Searches for files by name pattern. Safe to approve.";
  if (toolName === "Grep")
    return "Searches file contents. Safe to approve.";
  if (toolName === "Agent")
    return "Launches a sub-agent for a task. Review the task description.";
  if (toolName === "WebFetch")
    return "Fetches a web page. Check the URL.";
  if (toolName === "WebSearch")
    return "Runs a web search. Generally safe.";

  return "Review before approving.";
}

module.exports = { recommend };
