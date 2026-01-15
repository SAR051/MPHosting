/**
 * Bot manager using mineflayer (offline mode).
 * Keeps one bot per server id and enforces max duration.
 */

const mineflayer = require('mineflayer');

const bots = new Map(); // id -> { bot, timer }

function parseHostPort(hp) {
  if (!hp) return null;
  const [host, port] = hp.split(':');
  return { host, port: port ? parseInt(port,10) : 25565 };
}

async function startBot(id, hostOrHostPort, options = {}) {
  if (bots.has(id)) {
    // refresh timer
    const entry = bots.get(id);
    if (options.maxMs && entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => stopBot(id), options.maxMs);
    }
    return entry.bot;
  }

  const { host, port } = typeof hostOrHostPort === 'string' ? parseHostPort(hostOrHostPort) : hostOrHostPort;
  if (!host) throw new Error('Invalid host');

  const username = options.username || `WatchBot_${id.slice(0,6)}`;
  const auth = options.auth || 'offline';
  if (auth !== 'offline') throw new Error('Only offline auth supported here.');

  const bot = mineflayer.createBot({ host, port: port || 25565, username });

  bot.on('login', () => console.log(`[bot:${id}] logged in as ${username} -> ${host}:${port}`));
  bot.on('end', () => {
    console.log(`[bot:${id}] disconnected`);
    if (bots.has(id)) {
      const e = bots.get(id);
      if (e.timer) clearTimeout(e.timer);
      bots.delete(id);
    }
  });
  bot.on('error', err => console.warn(`[bot:${id}] error`, err && err.message));

  const timer = options.maxMs ? setTimeout(() => stopBot(id), options.maxMs) : null;
  bots.set(id, { bot, timer, meta: { host, port, username } });
  return bot;
}

function stopBot(id) {
  const entry = bots.get(id);
  if (!entry) return false;
  try { entry.bot.quit('Disconnecting by Watchdog'); } catch (e) {}
  if (entry.timer) clearTimeout(entry.timer);
  bots.delete(id);
  console.log(`[bot:${id}] stopped`);
  return true;
}

function isBotRunning(id) {
  return bots.has(id);
}

module.exports = { startBot, stopBot, isBotRunning };