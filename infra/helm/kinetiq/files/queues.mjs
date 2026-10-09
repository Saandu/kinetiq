import { createLocalQueueClient, ensureLocalQueues, requiredEnv } from '@kinetiq/runtime'
const client = createLocalQueueClient('http://localstack:4566')
try {
  const result = await ensureLocalQueues(client)
  if (result.queueUrl !== requiredEnv('SQS_QUEUE_URL')) throw new Error('Queue URL does not match chart configuration')
  console.log('Local SQS queue, dead-letter queue and redrive policy ready')
} finally { client.destroy() }
