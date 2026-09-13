require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { pingBedrockServer } = require('./bedrock-ping');

const app = express();

const PORT = process.env.PORT || 3000;
const SERVER_IP = process.env.SERVER_IP || 'LightStress.xyz';
const SERVER_PORT = Number(process.env.SERVER_PORT || 19132);
const PING_INTERVAL_MS = Number(process.env.PING_INTERVAL_MS || 5000);

// ---------------------------------------------------------------------------
// Estado en memoria (caché) del último ping real al servidor.
// Nunca se sirven datos falsos: arranca en null hasta el primer ping real.
// ---------------------------------------------------------------------------
let statusCache = null;
const sseClients = new Set();

async function refreshStatus() {
  const result = await pingBedrockServer(SERVER_IP, SERVER_PORT);

  statusCache = {
    online: result.online,
    players: result.online ? result.players : null,
    maxPlayers: result.online ? result.maxPlayers : null,
    motd: result.online ? result.motd : null,
    versionName: result.online ? result.versionName : null,
    lastUpdated: new Date().toISOString()
  };

  broadcastStatus();
}

function broadcastStatus() {
  const payload = `data: ${JSON.stringify(statusCache)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

// Primer ping inmediato, luego polling continuo cada PING_INTERVAL_MS.
refreshStatus();
setInterval(refreshStatus, PING_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Rate limiting — protege la API pública de abuso/spam.
// ---------------------------------------------------------------------------
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api', apiLimiter);
app.use(express.json());

// ---------------------------------------------------------------------------
// GET /api/status — status real cacheado (se actualiza solo por el poller).
// ---------------------------------------------------------------------------
app.get('/api/status', (req, res) => {
  if (!statusCache) {
    return res.json({ online: false, players: null, maxPlayers: null, lastUpdated: null });
  }
  res.json(statusCache);
});

// ---------------------------------------------------------------------------
// GET /api/status/stream — Server-Sent Events, empuja el status en tiempo
// real sin que el cliente tenga que recargar ni hacer polling agresivo.
// ---------------------------------------------------------------------------
app.get('/api/status/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write(': connected\n\n');

  if (statusCache) {
    res.write(`data: ${JSON.stringify(statusCache)}\n\n`);
  }

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// ---------------------------------------------------------------------------
// Endpoints de configuración — solo lectura, editable por el admin en disco
// sin tocar el frontend (config/products.json, events.json, raffles.json,
// free-ranks.json).
// ---------------------------------------------------------------------------
function readConfig(filename) {
  const filePath = path.join(__dirname, 'config', filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

app.get('/api/products', (req, res) => {
  try {
    res.json(readConfig('products.json'));
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer la configuración de productos.' });
  }
});

app.get('/api/free-ranks', (req, res) => {
  try {
    res.json(readConfig('free-ranks.json'));
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer la configuración de rangos gratuitos.' });
  }
});

app.get('/api/events', (req, res) => {
  try {
    res.json(readConfig('events.json'));
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer la configuración de eventos.' });
  }
});

app.get('/api/raffles', (req, res) => {
  try {
    res.json(readConfig('raffles.json'));
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer la configuración de sorteos.' });
  }
});

// ---------------------------------------------------------------------------
// Servir el frontend estático.
// IMPORTANTE: nunca se exponen aquí endpoints administrativos, consola,
// RCON ni nada que permita ejecutar comandos del servidor.
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`LightStress web escuchando en puerto ${PORT}`);
  console.log(`Consultando ${SERVER_IP}:${SERVER_PORT} cada ${PING_INTERVAL_MS}ms`);
});
