const { Client, GatewayIntentBits } = require("discord.js");

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const USER_ID = process.env.DISCORD_USER_ID;

let client = null;
let channel = null;
let onMessageCallback = null;

// Connect to Discord and start listening for messages
async function start(token) {
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on("messageCreate", (message) => {
    // Ignore bot's own messages
    if (message.author.bot) return;
    // Ignore messages from other channels
    if (message.channel.id !== CHANNEL_ID) return;

    // Only accept messages from the authorized user
    if (message.author.id !== USER_ID) {
      message.reply("Not authorized.").catch(() => {});
      return;
    }

    if (onMessageCallback) {
      onMessageCallback(message.content.trim());
    }
  });

  await client.login(token);

  channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel) {
    throw new Error(`Channel ${CHANNEL_ID} not found. Check DISCORD_CHANNEL_ID.`);
  }

  return client;
}

// Send a message to the configured channel.
// Splits long messages to stay within Discord's 2000-char limit.
async function sendMessage(text) {
  if (!channel) throw new Error("Discord not connected");

  const chunks = splitMessage(text, 1900);
  if (chunks.length > 1) {
    for (let i = 0; i < chunks.length; i++)
      chunks[i] += `\n(${i + 1}/${chunks.length})`;
  }
  for (const chunk of chunks) {
    await channel.send(chunk);
  }
}

// Send a structured permission prompt (embed + optional plain-text follow-up)
async function sendPermissionPrompt({ embed, followUp }) {
  if (!channel) throw new Error("Discord not connected");
  await channel.send({ embeds: [embed] });
  if (followUp) {
    await sendMessage(followUp);
  }
}

// Register a callback for when the authorized user sends a message
function onReply(callback) {
  onMessageCallback = callback;
}

// Disconnect from Discord
async function destroy() {
  if (client) await client.destroy();
}

// --- helpers ---

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline for cleaner breaks
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  return chunks;
}

module.exports = { start, sendMessage, sendPermissionPrompt, onReply, destroy };
