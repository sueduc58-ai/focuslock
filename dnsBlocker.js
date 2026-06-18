const dgram = require('dgram');

let server = null;

function buildResponse(query) {
  let offset = 12;
  while (offset < query.length) {
    if (query[offset] === 0) { offset++; break; }
    if ((query[offset] & 0xc0) === 0xc0) { offset += 2; break; }
    offset += query[offset] + 1;
  }
  offset += 4; // type + class
  const question = query.slice(12, offset);

  const header = Buffer.alloc(12);
  query.copy(header, 0, 0, 2);
  header[2] = 0x81; header[3] = 0x80;
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(1, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  const answer = Buffer.alloc(16);
  answer.writeUInt16BE(0xc00c, 0);
  answer.writeUInt16BE(1, 2);
  answer.writeUInt16BE(1, 4);
  answer.writeUInt32BE(1, 6);
  answer.writeUInt16BE(4, 10);
  answer[12] = 127; answer[13] = 0; answer[14] = 0; answer[15] = 1;

  return Buffer.concat([header, question, answer]);
}

function start() {
  if (server) return;
  server = dgram.createSocket('udp4');
  server.on('message', (msg, rinfo) => {
    try {
      const res = buildResponse(msg);
      server.send(res, rinfo.port, rinfo.address);
    } catch {}
  });
  server.on('error', () => {});
  server.bind(53, '127.0.0.1');
}

function stop() {
  if (!server) return;
  try { server.close(); } catch {}
  server = null;
}

module.exports = { start, stop };
