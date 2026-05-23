const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// CONFIGURATION
const PORT = 3000;
const SERIAL_PORT = ''; // Left blank for Mac auto-select or web-only testing
const BAUD_RATE = 9600;
const ALERT_THRESHOLD = 500;
const MAX_HISTORY = 50;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let history = [];
let latest = { smoke: 0, timestamp: Date.now() };

// REST API endpoint for manual/Wi-Fi data injection
app.post('/smoke', (req, res) => {
  const value = parseFloat(req.body.smoke);
  if (isNaN(value)) {
    return res.status(400).json({ error: 'Invalid smoke value' });
  }
  processReading(value);
  res.json({ success: true, received: value });
});

// Hardware Serial Connection Setup
function startSerial() {
  if (!SERIAL_PORT) {
    console.log('No serial port configured. Running in Web-Only mode.');
    return;
  }

  const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
  const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

  parser.on('data', (line) => {
    const value = parseInt(line.trim(), 10);
    if (!isNaN(value)) {
      console.log(⁠ Arduino → smoke: ${value} ⁠);
      processReading(value);
    }
  });

  port.on('error', (err) => {
    console.error('Serial error:', err.message);
    console.log('Retrying connection in 5 seconds...');
    setTimeout(startSerial, 5000);
  });
}

function processReading(value) {
  const reading = {
    smoke: value,
    timestamp: Date.now(),
    alert: value > ALERT_THRESHOLD
  };

  latest = reading;
  history.push(reading);
  if (history.length > MAX_HISTORY) history.shift();

  io.emit('smoke', reading);

  if (reading.alert) {
    console.warn(⁠ [ALERT] Smoke level ${value} exceeded ${ALERT_THRESHOLD}! ⁠);
  }
}

io.on('connection', (socket) => {
  socket.emit('init', { history, latest });
});

startSerial();

server.listen(PORT, () => {
  console.log(⁠ Fireshield dashboard running at http://localhost:${PORT} ⁠);
});
