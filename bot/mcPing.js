/**
 * Queries a Minecraft Java Edition server using the Server List Ping protocol.
 * Pure Node.js — no npm packages required.
 *
 * Returns: { online: true, players: { online: N, max: N }, motd: '...' }
 *      or: { online: false, error: '...' }
 */
const net = require('net');

function writeVarInt(value) {
  const bytes = [];
  do {
    let byte = value & 0x7F;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (value !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buf, offset) {
  let value = 0, shift = 0, byte, pos = offset;
  do {
    if (pos >= buf.length) throw new Error('VarInt too short');
    byte = buf[pos++];
    value |= (byte & 0x7F) << shift;
    shift += 7;
  } while (byte & 0x80);
  return { value, bytesRead: pos - offset };
}

function buildHandshake(host, port) {
  const hostBuf = Buffer.from(host, 'utf8');
  const hostLen = writeVarInt(hostBuf.length);
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port);
  const nextState = writeVarInt(1); // 1 = status

  const payload = Buffer.concat([
    writeVarInt(0x00),     // packet ID: Handshake
    writeVarInt(765),      // protocol version (1.20.4; any modern version works for status)
    hostLen, hostBuf,
    portBuf,
    nextState,
  ]);
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

function buildStatusRequest() {
  const payload = writeVarInt(0x00); // packet ID: Status Request
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

function pingServer(host, port = 25565, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let resolved = false;

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => {
      done({ online: false, error: 'timeout' });
    }, timeoutMs);

    socket.on('connect', () => {
      socket.write(buildHandshake(host, port));
      socket.write(buildStatusRequest());
    });

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        // Try to read the full packet
        const lenResult = readVarInt(buf, 0);
        const totalLen = lenResult.value + lenResult.bytesRead;
        if (buf.length < totalLen) return; // wait for more data

        const packetData = buf.slice(lenResult.bytesRead, totalLen);
        const idResult = readVarInt(packetData, 0);
        if (idResult.value !== 0x00) return; // not status response

        const jsonLenResult = readVarInt(packetData, idResult.bytesRead);
        const jsonStart = idResult.bytesRead + jsonLenResult.bytesRead;
        const jsonStr = packetData.slice(jsonStart, jsonStart + jsonLenResult.value).toString('utf8');
        const data = JSON.parse(jsonStr);

        clearTimeout(timer);
        done({
          online: true,
          players: {
            online: data.players?.online ?? 0,
            max: data.players?.max ?? 0,
            sample: (data.players?.sample || []).map(p => p.name),
          },
          motd: typeof data.description === 'string'
            ? data.description
            : (data.description?.text ?? ''),
          version: data.version?.name ?? 'Unknown',
        });
      } catch (_) {
        // partial data, keep waiting
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      done({ online: false, error: err.message });
    });

    socket.on('close', () => {
      clearTimeout(timer);
      if (!resolved) done({ online: false, error: 'connection closed' });
    });

    socket.connect(port, host);
  });
}

module.exports = { pingServer };
