import { ChangeMessageVisibilityCommand, DeleteMessageCommand, type Message } from '@aws-sdk/client-sqs'
import { describe, expect, it, vi } from 'vitest'
import { type SQSClient } from '@kinetiq/runtime'
import { processMessage, runConsumer, type ConsumerConfig } from '../src/index.js'

const body = JSON.stringify({ v: 1, machineId: 'DEMO-CNC-01', seq: 1, readings: [{ ts: '2026-10-05T12:00:00.000Z', state: 3, online: true,
  metrics: { temperatureC: 45, vibrationMmS: 2, spindleRpm: 5000, powerKw: 4 } }] })
const message: Message = { Body: body, ReceiptHandle: 'receipt', MessageAttributes: Object.fromEntries(Object.entries({
  thingName: 'DEMO-CNC-01', machineId: 'DEMO-CNC-01', siteId: '11111111-1111-4111-8111-111111111112',
}).map(([name, value]) => [name, { DataType: 'String', StringValue: value }])) }
function config(send = vi.fn().mockResolvedValue({}), persist = vi.fn().mockResolvedValue(1)): ConsumerConfig {
  return { queue: { send } as unknown as SQSClient, queueUrl: 'http://localhost/queue', signal: new AbortController().signal, persist }
}

describe('commit before acknowledgement', () => {
  it('deletes only after persistence finishes, including a duplicate with zero inserts', async () => {
    const order: string[] = []
    const send = vi.fn(async (command) => { expect(command).toBeInstanceOf(DeleteMessageCommand); order.push('delete'); return {} })
    const persist = vi.fn(async () => { order.push('commit'); return 0 })
    expect(await processMessage(config(send, persist), message)).toBe('committed')
    expect(order).toEqual(['commit', 'delete'])
  })
  it('retains a message when the database fails', async () => {
    const send = vi.fn(); const persist = vi.fn().mockRejectedValue(new Error('DB unavailable'))
    expect(await processMessage(config(send, persist), message)).toBe('retry')
    expect(send).not.toHaveBeenCalled()
  })
  it('permits redelivery if deletion fails after commit', async () => {
    const persist = vi.fn().mockResolvedValue(1)
    expect(await processMessage(config(vi.fn().mockRejectedValue(new Error('Network failure')), persist), message)).toBe('retry')
    expect(persist).toHaveBeenCalledOnce()
  })
  it('extends the processing lease while a commit is pending and stops after acknowledgement', async () => {
    vi.useFakeTimers()
    let finish!: (count: number) => void
    const persist = vi.fn(() => new Promise<number>((resolve) => { finish = resolve }))
    const send = vi.fn().mockResolvedValue({})
    const processing = processMessage(config(send, persist), message)
    try {
      await vi.advanceTimersByTimeAsync(30_000)
      const command = send.mock.calls[0]![0] as ChangeMessageVisibilityCommand
      expect(command).toBeInstanceOf(ChangeMessageVisibilityCommand)
      expect(command.input).toMatchObject({ ReceiptHandle: 'receipt', VisibilityTimeout: 90 })
      finish(1)
      expect(await processing).toBe('committed')
      await vi.advanceTimersByTimeAsync(60_000)
      expect(send).toHaveBeenCalledTimes(2)
    } finally { finish(1); await processing; vi.useRealTimers() }
  })
  it('rejects malformed and mismatched payloads without writes or deletion', async () => {
    for (const Body of ['not json', body.replace('DEMO-CNC-01', 'OTHER-01')]) {
      const send = vi.fn(); const persist = vi.fn()
      expect(await processMessage(config(send, persist), { ...message, Body })).toBe('retry')
      expect(persist).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled()
    }
  })
  it('finishes an in-flight commit and deletion before shutdown returns', async () => {
    const controller = new AbortController(); const order: string[] = []
    const send = vi.fn(async (command) => {
      if (command instanceof DeleteMessageCommand) { order.push('delete'); return {} }
      return { Messages: [message] }
    })
    const persist = vi.fn(async () => { controller.abort(); await Promise.resolve(); order.push('commit'); return 1 })
    await runConsumer({ ...config(send, persist), signal: controller.signal })
    expect(order).toEqual(['commit', 'delete']); expect(send).toHaveBeenCalledTimes(2)
  })
})
