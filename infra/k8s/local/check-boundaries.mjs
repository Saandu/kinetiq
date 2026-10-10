import assert from 'node:assert/strict';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { connectAsync } from 'mqtt';

async function denied(host, port) {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(2500);
    socket.once('connect', () => { socket.destroy(); reject(new Error(`Unexpected access to ${host}:${port}`)); });
    socket.once('timeout', () => { socket.destroy(); resolve(); });
    socket.once('error', error => { socket.destroy(); if (error.code === 'ENOTFOUND') reject(error); else resolve(); });
  });
}
if (process.env.CHECK_MODE === 'untrusted') {
  for (const [host, port] of [['api', 8080], ['postgres', 5432], ['mosquitto', 1883], ['localstack', 4566]]) await denied(host, port);
  console.log('Untrusted Pod denied access to API, database, MQTT and queues');
} else {
  await assert.rejects(connectAsync('mqtt://mosquitto:1883', { username: 'DEMO-CNC-01', password: 'wrong-password',
    reconnectPeriod: 0, connectTimeout: 5000, protocolVersion: 5 }), /authorized/i);
  const client = await connectAsync('mqtt://mosquitto:1883', { username: 'DEMO-CNC-01',
    password: readFileSync('/secrets/device/password', 'utf8').trim(), clientId: `boundary-${Date.now()}`,
    reconnectPeriod: 0, connectTimeout: 5000, protocolVersion: 5 });
  try {
    await assert.rejects(client.publishAsync('kinetiq/11111111-1111-4111-8111-111111111112/DEMO-DRL-02/telemetry', '{}', { qos: 1 }), /authorized/i);
  } finally { await client.endAsync(true); }
  await denied('api', 8080); await denied('postgres', 5432);
  console.log('MQTT rejects wrong credentials and cross-device writes; bridge network identity cannot reach API or database');
}
