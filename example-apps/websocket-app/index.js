'use strict';

let http = require('http');
let path = require('path');
let fs = require('fs');
let serverConfig = JSON.parse(process.env.HC_APP_CONFIG);

let serv = http.createServer(function (req, res) {
  if (req.url === '/socket/index.html') {
    res.end(`
      <div id="msg"></div>
      <script>
      var msgBox = document.querySelector('#msg');
      var ws = new WebSocket("ws://localhost:8080/socket");
      ws.onopen = function() {
        setInterval(function () {
          ws.send('hello');
        }, 1000);
      };
      ws.onclose = function(event) {
        console.log('Client notified socket has closed',event);
      };
      ws.onmessage = function (msg) {
        let node = document.createElement('p');
        node.innerHTML = msg.data;
        msgBox.appendChild(node);
      };
    </script>`
    );
  } else {
    res.setHeader('content-type', 'text/html');
    res.end('hi, client here to <a href="/socket/index.html">start websocket test</a>');
  }
});

/**
 * code from: https://github.com/abbshr/websocket_talk
 */

function encodeFrame(frame) {
  var preBytes = [];
  var payBytes = new Buffer(frame['Payload_data']);
  var dataLength = payBytes.length;

  preBytes.push((frame['FIN'] << 7) + frame['Opcode']);

  if (dataLength < 126)
    preBytes.push((frame['MASK'] << 7) + dataLength);

  else if (dataLength < Math.pow(2, 16))
    preBytes.push(
      (frame['MASK'] << 7) + 126,
      (dataLength & 0xFF00) >> 8,
      dataLength & 0xFF
    );

  else
    preBytes.push(
      (frame['MASK'] << 7) + 127,
      0, 0, 0, 0,
      (dataLength & 0xFF000000) >> 24,
      (dataLength & 0xFF0000) >> 16,
      (dataLength & 0xFF00) >> 8,
      dataLength & 0xFF
    );

  preBytes = new Buffer(preBytes);
  return Buffer.concat([preBytes, payBytes]);
}

function decodeFrame(frame) {
  if (frame.length < 2) return null;

  var counter = 0;

  var finOffset = 7;
  var opcodeOffset = parseInt(1111, 2);
  var maskOffset = 7;
  var payloadLenOffset = parseInt(1111111, 2);

  var FIN = frame[counter] >> finOffset;
  var Opcode = frame[counter++] & opcodeOffset;
  var MASK = frame[counter] >> maskOffset;
  var PayloadLen = frame[counter++] & payloadLenOffset;

  PayloadLen === 126 &&
  (PayloadLen = frame.readUInt16BE(counter)) &&
  (counter += 2);

  PayloadLen === 127 &&
  (PayloadLen = frame.readUInt32BE(counter + 4)) &&
  (counter += 8);

  var buffer = new Buffer(PayloadLen);
  if (MASK) {
    var MaskingKey = frame.slice(counter, counter + 4);
    counter += 4;
    for (var i = 0; i < PayloadLen; i++) {
      var j = i % 4;
      buffer[i] = frame[counter + i] ^ MaskingKey[j];
    }
  }

  if (frame.length < counter + PayloadLen) {
    return undefined;
  }
  frame = frame.slice(counter + PayloadLen);

  return {
    FIN: FIN,
    Opcode: Opcode,
    MASK: MASK,
    Payload_len: PayloadLen,
    Payload_data: buffer,
    frame: frame
  };
}

const crypto = require('crypto');
serv.on('upgrade', (req, socket) => {
  // calc key
  var key = req.headers['sec-websocket-key'];
  var shasum = crypto.createHash('sha1');
  shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
  key = shasum.digest('base64');

  var headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + key
  ];
  socket.write(headers.join('\r\n') + '\r\n\r\n');
  console.log('server upgrade'); //eslint-disable-line
  var frame = {
    buffer: new Buffer(0)
  };
  socket.on('data', function (data) {
    frame.buffer = Buffer.concat([frame.buffer, data]);
    var readableData;
    while ((readableData = decodeFrame(frame.buffer))) {
      console.log('Client say: ' + readableData['Payload_data'].toString()); // eslint-disable-line
      frame.buffer = readableData.frame;
      socket.write(encodeFrame({
        FIN: 1,
        Opcode: 1,
        MASK: 0,
        Payload_data: 'server said:' + readableData.Payload_data + ' ' + new Date()
      }));
    }
  });
  socket.on('end', function () {
    console.log('client close'); // eslint-disable-line
  });
});

exports.run = function (cb) {
  let sock = serverConfig.targetSock || path.join(__dirname, '../../sock.sock');
  serv.listen(sock);
  cb(null, {
    bind: '8080',
    router: '/socket',
    target: sock
  });
  process.on('exit', function () {
    try {
      fs.unlinkSync(sock);
    } catch (e) {
      // do nothing
    }
  });
};
