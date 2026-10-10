import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import pg from 'pg';
import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { telemetryBatchSchema } from '@kinetiq/contracts';
import { createLocalQueueClient, databaseTls } from '@kinetiq/runtime';

if (process.env.CHECK_MODE === 'lock') {
  const connectionString = readFileSync('/secrets/admin/database-url', 'utf8').trim();
  const client = new pg.Client({ connectionString, ssl: databaseTls(connectionString) });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT thing_name FROM kinetiq.devices WHERE thing_name='DEMO-CNC-01' FOR UPDATE");
    console.log('Device write lock acquired; API reads remain available');
    await client.query('SELECT pg_sleep(70)');
    await client.query('COMMIT');
    console.log('Device write lock released');
  } finally { await client.end(); }
} else {
  // Exactly 200 valid messages, at most 20 per second; never an unbounded load loop.
  const start = Number(process.env.FIXTURE_START);
  assert.ok(Number.isSafeInteger(start) && Math.abs(Date.now() - start) < 7200_000);
  const queue = createLocalQueueClient('http://localstack:4566');
  try {
    for (let offset = 0; offset < 200; offset += 10) {
      const Entries = Array.from({ length: 10 }, (_, i) => {
        const index = offset + i;
        const batch = telemetryBatchSchema.parse({ v: 1, machineId: 'DEMO-CNC-01', seq: index,
          readings: [{ ts: new Date(start + index).toISOString(), online: true, state: 2,
            metrics: { temperatureC: 40, vibrationMmS: 1, spindleRpm: 1000, powerKw: 2 } }] });
        return { Id: String(index), MessageBody: JSON.stringify(batch), MessageAttributes:
          Object.fromEntries(Object.entries({ thingName: 'DEMO-CNC-01', machineId: 'DEMO-CNC-01', siteId: '11111111-1111-4111-8111-111111111112' })
            .map(([key, value]) => [key, { DataType: 'String', StringValue: value }])) };
      });
      const result = await queue.send(new SendMessageBatchCommand({ QueueUrl: 'http://localstack:4566/queue/us-east-1/000000000000/kinetiq-telemetry', Entries }),
        { abortSignal: AbortSignal.timeout(10_000) });
      assert.equal(result.Failed?.length ?? 0, 0);
      await wait(500);
    }
    console.log('Published 200 bounded valid fixture messages');
  } finally { queue.destroy(); }
}
