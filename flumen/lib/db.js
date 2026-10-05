/**
 * Shared database connection pool with SSH tunnel to 0003.
 *
 * The tunnel and PG pool are created once and reused across all API route
 * invocations for the lifetime of the Node process. In dev mode, hot-reload
 * can re-import this module, so we store the singleton on `globalThis`.
 */
const { Client: SSHClient } = require('ssh2');
const { Pool } = require('pg');
const net = require('net');
const fs = require('fs');
const path = require('path');

const SSH_HOST  = process.env.SSH_HOST  || 'tosmonline0003.ttu.edu';
const SSH_PORT  = parseInt(process.env.SSH_PORT || '22');
const SSH_USER  = process.env.SSH_USER  || 'prajsrin';
const SSH_KEY   = process.env.SSH_KEY_PATH || path.join(
  process.env.HOME || process.env.USERPROFILE || '/home/prajsrin',
  '.ssh', 'id_ed25519_ttu'
);

const PG_USER        = process.env.PG_USER     || 'campusce_etl';
const PG_PASS        = process.env.PG_PASSWORD || undefined;  // undefined = skip auth (trust)
const PG_DB          = process.env.PG_DATABASE || 'CampusCE_ADS_DB';
const PG_REMOTE_HOST = '127.0.0.1';
const PG_REMOTE_PORT = parseInt(process.env.PG_REMOTE_PORT || '5433');

/* ---------- tunnel + pool singleton ---------- */

let _ready = null;   // Promise<{ pool, sshClient }>

function createTunnel() {
  if (_ready) return _ready;

  _ready = new Promise((resolve, reject) => {
    let keyData;
    try { keyData = fs.readFileSync(SSH_KEY); } catch (e) {
      reject(new Error(`Cannot read SSH key at ${SSH_KEY}: ${e.message}`));
      return;
    }

    const ssh = new SSHClient();

    const localServer = net.createServer(sock => {
      ssh.forwardOut(sock.remoteAddress, sock.remotePort, PG_REMOTE_HOST, PG_REMOTE_PORT, (err, stream) => {
        if (err) { sock.end(); return; }
        sock.pipe(stream).pipe(sock);
      });
    });

    ssh.on('ready', () => {
      localServer.listen(0, '127.0.0.1', () => {
        const localPort = localServer.address().port;
        const pool = new Pool({
          host: '127.0.0.1',
          port: localPort,
          user: PG_USER,
          password: PG_PASS,
          database: PG_DB,
          max: 6,
          idleTimeoutMillis: 60_000,
          connectionTimeoutMillis: 10_000,
        });
        console.log(`[flumen] SSH tunnel up → 127.0.0.1:${localPort} → ${SSH_HOST}:${PG_REMOTE_PORT}`);
        resolve({ pool, ssh, localServer });
      });
    });

    ssh.on('error', err => {
      console.error('[flumen] SSH error:', err.message);
      _ready = null;
      reject(err);
    });

    ssh.on('end', () => {
      console.warn('[flumen] SSH tunnel disconnected; will reconnect on next query');
      _ready = null;
      localServer.close();
    });

    ssh.connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, privateKey: keyData });
  });

  return _ready;
}

/**
 * Get the PG pool (creates tunnel if needed).
 */
async function getPool() {
  const { pool } = await createTunnel();
  return pool;
}

/**
 * Run a parameterised query with automatic retry on tunnel drop.
 */
async function q(text, params = []) {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const pool = await getPool();
      return await pool.query(text, params);
    } catch (err) {
      if (attempt < maxRetries && (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.message.includes('Connection terminated'))) {
        console.warn(`[flumen] Query failed (${err.code || err.message}); reconnecting (attempt ${attempt + 1})`);
        _ready = null;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Run a command on 0003 over the SSH connection.
 */
async function sshExec(command) {
  const { ssh } = await createTunnel();
  return new Promise((resolve, reject) => {
    ssh.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', d => { stdout += d; });
      stream.stderr.on('data', d => { stderr += d; });
      stream.on('close', (code) => resolve({ stdout, stderr, code }));
    });
  });
}

module.exports = { getPool, q, sshExec };
