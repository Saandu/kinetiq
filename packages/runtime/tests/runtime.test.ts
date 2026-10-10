import { afterEach, describe, expect, it, vi } from 'vitest'
import { databaseTls, assertLocalMqttEndpoint, createLocalQueueClient, parseTelemetryTopic, untilStopped } from '../src/index.js'

describe('local runtime boundaries', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('rejects connection parameters that could weaken configured certificate verification', () => {
    vi.stubEnv('DATABASE_CA_FILE', '/missing-ca.crt')
    for (const parameter of ['ssl=0', 'sslmode=disable', 'sslmode=no-verify', 'sslrootcert=other', 'sslcert=other', 'sslkey=other']) {
      expect(() => databaseTls(`postgresql://postgres/kinetiq?${parameter}`)).toThrow('must not override certificate verification')
    }
    expect(() => databaseTls('postgresql://postgres/kinetiq')).toThrow()
  })
  it('leaves local Compose connections unchanged when no CA is configured', () => {
    vi.stubEnv('DATABASE_CA_FILE', '')
    expect(databaseTls('postgresql://postgres/kinetiq')).toBeUndefined()
  })
  it('accepts the exact transport topic and rejects missing or extra fields', () => {
    const site = '11111111-1111-4111-8111-111111111112'
    expect(parseTelemetryTopic(`kinetiq/${site}/DEMO-CNC-01/telemetry`)).toEqual({ thingName: 'DEMO-CNC-01', machineId: 'DEMO-CNC-01', siteId: site })
    for (const topic of ['kinetiq/bad/DEMO-CNC-01/telemetry', `kinetiq/${site}/+/telemetry`, `kinetiq/${site}/DEMO-CNC-01/telemetry/extra`]) {
      expect(() => parseTelemetryTopic(topic)).toThrow()
    }
  })
  it('prevents local services from contacting a real AWS endpoint', () => {
    for (const endpoint of ['https://sqs.us-east-1.amazonaws.com', 'http://example.com', 'https://localhost:4566']) {
      expect(() => createLocalQueueClient(endpoint)).toThrow()
    }
    const client = createLocalQueueClient('http://localhost:4566'); client.destroy()
    expect(() => assertLocalMqttEndpoint('mqtts://example.amazonaws.com')).toThrow()
    expect(() => assertLocalMqttEndpoint('mqtt://example.com')).toThrow()
    expect(() => assertLocalMqttEndpoint('mqtt://mosquitto:1883')).not.toThrow()
  })
  it('unblocks a pending operation on shutdown', async () => {
    const controller = new AbortController()
    const operation = untilStopped(new Promise<never>(() => {}), controller.signal)
    controller.abort()
    await expect(operation).rejects.toThrow('Stopping')
  })
})
