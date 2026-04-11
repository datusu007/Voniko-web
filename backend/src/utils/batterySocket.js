/**
 * batterySocket.js
 * WebSocket hub — relays SSE events from Python battery_service
 * to all connected browser clients, and proxies control commands
 * from the browser to the Python service.
 */
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const axios = require('axios');
const logger = require('./logger');

const PYTHON_BASE = process.env.BATTERY_SERVICE_URL || 'http://127.0.0.1:8765';

let wss = null;
// Map<ws, { userId, token }>
const clients = new Map();
// Active SSE connection to Python (one shared stream)
let sseAbortController = null;
let sseConnected = false;

function initBatteryWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws/battery' });

  wss.on('connection', (ws, req) => {
    // Extract token from query string ?token=...
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token') || null;
    clients.set(ws, { token });
    logger.info('Battery WS client connected', { total: clients.size });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        await handleClientMessage(ws, msg);
      } catch (e) {
        sendToClient(ws, { type: 'error', message: e.message });
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.info('Battery WS client disconnected', { total: clients.size });
      // If no clients left, stop the SSE relay
      if (clients.size === 0) stopSseRelay();
    });

    ws.on('error', (err) => {
      logger.error('Battery WS error', { error: err.message });
      clients.delete(ws);
    });
  });

  logger.info('Battery WebSocket server initialised at /ws/battery');
}

async function handleClientMessage(ws, msg) {
  const { action, payload } = msg;

  if (action === 'connect') {
    // POST /connect to Python
    try {
      const res = await axios.post(`${PYTHON_BASE}/connect`, payload || {});
      broadcast({ type: 'connect_result', ok: true, message: res.data.message });
      // Start SSE relay so live readings stream to all WS clients
      startSseRelay();
    } catch (e) {
      const detail = e.response?.data?.detail || e.message;
      broadcast({ type: 'connect_result', ok: false, message: detail });
    }
    return;
  }

  if (action === 'disconnect') {
    try {
      await axios.post(`${PYTHON_BASE}/disconnect`);
    } catch (_) {}
    stopSseRelay();
    broadcast({ type: 'disconnected' });
    return;
  }

  if (action === 'start') {
    try {
      await axios.post(`${PYTHON_BASE}/start`, payload || {});
      broadcast({ type: 'test_started' });
    } catch (e) {
      const detail = e.response?.data?.detail || e.message;
      broadcast({ type: 'error', message: detail });
    }
    return;
  }

  if (action === 'stop') {
    try {
      await axios.post(`${PYTHON_BASE}/stop`);
      broadcast({ type: 'test_stopped' });
    } catch (e) {
      const detail = e.response?.data?.detail || e.message;
      broadcast({ type: 'error', message: detail });
    }
    return;
  }

  if (action === 'get_ports') {
    try {
      const res = await axios.get(`${PYTHON_BASE}/ports`);
      sendToClient(ws, { type: 'ports', ports: res.data.ports });
    } catch (e) {
      sendToClient(ws, { type: 'ports', ports: [], error: e.message });
    }
    return;
  }

  if (action === 'get_status') {
    try {
      const res = await axios.get(`${PYTHON_BASE}/status`);
      sendToClient(ws, { type: 'status', data: res.data });
    } catch (e) {
      sendToClient(ws, { type: 'error', message: e.message });
    }
    return;
  }

  if (action === 'clear_session') {
    try {
      await axios.delete(`${PYTHON_BASE}/session`);
      broadcast({ type: 'session_cleared' });
    } catch (e) {
      sendToClient(ws, { type: 'error', message: e.message });
    }
    return;
  }
}

function startSseRelay() {
  if (sseConnected) return;
  sseConnected = true;
  sseAbortController = new AbortController();

  (async () => {
    try {
      const response = await axios.get(`${PYTHON_BASE}/stream`, {
        responseType: 'stream',
        signal: sseAbortController.signal,
        timeout: 0, // no timeout on streaming
      });

      let buffer = '';
      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        // SSE events are separated by double newline
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep incomplete last part
        for (const part of parts) {
          if (!part.trim()) continue;
          // SSE format: "data: {...}"
          const dataLine = part.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const json = JSON.parse(dataLine.slice(5).trim());
            broadcast(json);
          } catch (_) {}
        }
      });

      response.data.on('end', () => {
        sseConnected = false;
        logger.info('Battery SSE stream ended');
      });

      response.data.on('error', (err) => {
        sseConnected = false;
        logger.warn('Battery SSE stream error', { error: err.message });
      });

    } catch (e) {
      sseConnected = false;
      if (e.code !== 'ERR_CANCELED') {
        logger.warn('Battery SSE relay failed', { error: e.message });
      }
    }
  })();
}

function stopSseRelay() {
  if (sseAbortController) {
    sseAbortController.abort();
    sseAbortController = null;
  }
  sseConnected = false;
}

function broadcast(data) {
  const str = JSON.stringify(data);
  for (const [ws] of clients) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(str);
    } catch (_) {}
  }
}

function sendToClient(ws, data) {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  } catch (_) {}
}

module.exports = { initBatteryWebSocket };
