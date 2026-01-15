const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Queue, QueueScheduler } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const DATA_FILE = path.resolve(__dirname, '../data/servers.json');
if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

function loadServers() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]');
}
function saveServers(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

const app = express();
app.use(bodyParser.json());
app.use(require('cors')());
app.use(express.static(path.join(__dirname, '../public')));

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = { connection: { connectionString: redisUrl } };

// create queue and scheduler
const monitorQueue = new Queue('monitor-queue', { connection: { connectionString: redisUrl }});
new QueueScheduler('monitor-queue', { connection: { connectionString: redisUrl } });

const DEFAULT_CHECK_INTERVAL_MS = parseInt(process.env.DEFAULT_CHECK_INTERVAL_MS || '60000', 10);

// list servers
app.get('/api/servers', (req, res) => {
  res.json(loadServers());
});

// add server
// body: { name, host, port, botUsername?, save:boolean, maxRunHours?, checkIntervalMs? }
app.post('/api/servers', async (req, res) => {
  const { name, host, port, botUsername, save = false, maxRunHours = 8, checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS } = req.body;
  if (!name || !host || !port) return res.status(400).json({ error: 'name, host and port required' });

  const servers = loadServers();
  const id = uuidv4();
  const server = {
    id,
    name,
    host,
    port: parseInt(port, 10),
    botUsername: botUsername || `WatchBot_${id.slice(0,6)}`,
    save: !!save,
    maxRunHours,
    checkIntervalMs,
    state: 'unknown',
    lastSeen: null
  };
  servers.push(server);
  saveServers(servers);

  // if save true -> create repeatable monitor job
  if (server.save) {
    await monitorQueue.add(
      'monitor',
      { id },
      { jobId: `monitor-${id}`, repeat: { every: Math.max(1000, server.checkIntervalMs) } }
    );
  }

  res.json(server);
});

// remove server
app.delete('/api/servers/:id', async (req, res) => {
  const id = req.params.id;
  let servers = loadServers();
  const exists = servers.some(s => s.id === id);
  servers = servers.filter(s => s.id !== id);
  saveServers(servers);
  if (exists) {
    // remove repeatable job (best-effort)
    try {
      const queue = monitorQueue;
      const repeats = await queue.getRepeatableJobs();
      for (const r of repeats) {
        if (r.id === `monitor-${id}`) {
          await queue.removeRepeatable(r.name, r.opts);
        }
      }
    } catch (e) {
      console.warn('remove repeatable job error', e.message);
    }
  }
  res.json({ ok: true });
});

// get server
app.get('/api/servers/:id', (req, res) => {
  const s = loadServers().find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(s);
});

// force-join (anyone can call) -> enqueue force-start job
app.post('/api/servers/:id/join', async (req, res) => {
  const id = req.params.id;
  const servers = loadServers();
  const s = servers.find(x => x.id === id);
  if (!s) return res.status(404).json({ error: 'not found' });
  // enqueue one-off job to have worker start bot immediately
  await monitorQueue.add('force-join', { id }, { jobId: `force-join-${id}-${Date.now()}` , attempts: 3});
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));