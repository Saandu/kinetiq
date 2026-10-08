import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { connectAsync } from 'mqtt'
import { GenericContainer, Wait } from 'testcontainers'
import { expect, it } from 'vitest'

it('regenerates broker credentials on repeated starts and preserves MQTT state', async () => {
  const password = randomBytes(24).toString('hex')
  const topic = 'kinetiq/test/device/telemetry'
  const local = fileURLToPath(new URL('../../../infra/local/', import.meta.url))
  const broker = await new GenericContainer('eclipse-mosquitto:2.1.2-alpine@sha256:38c0da4f2ef84284d47b3b3eeea1cb3bdeabe81ee10caf0cd5c5ff61ee3ea408')
    .withCopyFilesToContainer([
      { source: `${local}/start-mosquitto.sh`, target: '/local/start-mosquitto.sh' },
      { source: `${local}/mosquitto.conf`, target: '/local/mosquitto.conf' },
    ])
    .withCopyContentToContainer([
      { content: password, target: '/secrets/mqtt-device/password' },
      { content: password, target: '/secrets/mqtt-bridge/password' },
      { content: `user bridge\ntopic readwrite ${topic}\n`, target: '/secrets/mqtt-bridge/acl' },
    ])
    .withEntrypoint(['sh', '/local/start-mosquitto.sh'])
    .withExposedPorts(1883)
    .withWaitStrategy(Wait.forLogMessage(/mosquitto version .* running/))
    .withStartupTimeout(15_000)
    .start()
  const connect = () => connectAsync(`mqtt://${broker.getHost()}:${broker.getMappedPort(1883)}`, {
    username: 'bridge', password, protocolVersion: 5, reconnectPeriod: 0, connectTimeout: 5000,
  })
  try {
    const publisher = await connect()
    try { await publisher.publishAsync(topic, 'retained-before-restart', { qos: 1, retain: true }) }
    finally { await publisher.endAsync() }
    for (let restart = 0; restart < 2; restart++) {
      // Graceful stop flushes retained state; restart reuses the same /tmp files.
      await broker.restart({ timeout: 10 })
      const subscriber = await connect()
      try {
        const message = new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Retained message missing after restart')), 5000)
          subscriber.once('message', (_, payload) => { clearTimeout(timer); resolve(payload.toString()) })
        })
        await subscriber.subscribeAsync(topic, { qos: 1 })
        expect(await message).toBe('retained-before-restart')
        const permissions = await broker.exec(['stat', '-c', '%a:%U', '/tmp/passwords', '/tmp/acl'])
        expect(permissions.exitCode).toBe(0)
        expect(permissions.output.trim().split(/\r?\n/)).toEqual(['600:mosquitto', '600:mosquitto'])
      } finally { await subscriber.endAsync(true) }
    }
  } finally { await broker.stop() }
}, 60_000)
