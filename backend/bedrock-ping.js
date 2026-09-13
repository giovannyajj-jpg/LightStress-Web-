/**
 * bedrock-ping.js
 *
 * Implementación del protocolo RakNet "Unconnected Ping / Unconnected Pong"
 * usado por todos los servidores de Minecraft Bedrock para responder
 * consultas de status (el mismo mecanismo que usan launchers oficiales
 * y sitios como mcsrvstat.us).
 *
 * IMPORTANTE — limitación real del protocolo:
 * Este ping SOLO devuelve: MOTD, versión, cantidad de jugadores online,
 * máximo de jugadores, gamemode, etc. El protocolo NO incluye los nombres
 * de los jugadores conectados — eso solo lo sabe el proceso del servidor
 * en memoria. Por eso el proyecto muestra "X / MAX" y no una lista de
 * nombres, tal como se decidió.
 *
 * No se inventan datos: si el servidor no responde antes del timeout,
 * se reporta offline explícitamente.
 */

const dgram = require('dgram');

// Magic bytes fijos del protocolo RakNet (offline message data ID)
const RAKNET_MAGIC = Buffer.from([
  0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe,
  0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78
]);

const ID_UNCONNECTED_PING = 0x01;
const ID_UNCONNECTED_PONG = 0x1c;

function buildPingPacket(clientGUID) {
  const buf = Buffer.alloc(1 + 8 + 16 + 8);
  let offset = 0;

  buf.writeUInt8(ID_UNCONNECTED_PING, offset); offset += 1;
  buf.writeBigInt64BE(BigInt(Date.now()), offset); offset += 8;
  RAKNET_MAGIC.copy(buf, offset); offset += 16;
  buf.writeBigUInt64BE(clientGUID, offset); offset += 8;

  return buf;
}

function parsePongPacket(msg) {
  let offset = 0;
  const id = msg.readUInt8(offset); offset += 1;

  if (id !== ID_UNCONNECTED_PONG) {
    throw new Error(`Paquete inesperado (id=${id}), no es un Unconnected Pong`);
  }

  offset += 8; // time (echo)
  offset += 8; // server GUID
  offset += 16; // magic

  const length = msg.readUInt16BE(offset); offset += 2;
  const serverIdString = msg.toString('utf8', offset, offset + length);

  // El server ID string de Bedrock viene separado por ';', formato:
  // MCPE;MOTD;protocolVersion;versionName;playerCount;maxPlayers;
  // serverUniqueId;subMotd;gameMode;gameModeNumeric;port;portv6;
  const fields = serverIdString.split(';');

  return {
    edition: fields[0] || null,
    motd: fields[1] || null,
    protocolVersion: fields[2] ? Number(fields[2]) : null,
    versionName: fields[3] || null,
    players: fields[4] !== undefined ? Number(fields[4]) : null,
    maxPlayers: fields[5] !== undefined ? Number(fields[5]) : null,
    serverUniqueId: fields[6] || null,
    subMotd: fields[7] || null,
    gameMode: fields[8] || null
  };
}

/**
 * Consulta un servidor Bedrock real vía UDP.
 * Resuelve con { online: true, ...datos } o { online: false }.
 * Nunca inventa datos: si hay timeout o error, online=false.
 */
function pingBedrockServer(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const clientGUID = BigInt(Math.floor(Math.random() * 1e15));
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch (_) {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ online: false, reason: 'timeout' });
    }, timeoutMs);

    socket.on('error', () => {
      finish({ online: false, reason: 'socket_error' });
    });

    socket.on('message', (msg) => {
      try {
        const parsed = parsePongPacket(msg);
        finish({ online: true, ...parsed, lastUpdated: new Date().toISOString() });
      } catch (err) {
        finish({ online: false, reason: 'parse_error' });
      }
    });

    try {
      const packet = buildPingPacket(clientGUID);
      socket.send(packet, port, host);
    } catch (err) {
      finish({ online: false, reason: 'send_error' });
    }
  });
}

module.exports = { pingBedrockServer };
