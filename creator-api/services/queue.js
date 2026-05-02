import { Queue } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const u = new URL(REDIS_URL)
const connection = {
  host: u.hostname,
  port: parseInt(u.port || '6379'),
}

export const generationQueue = new Queue('generation', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

export const publishQueue = new Queue('publish', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

export async function getQueueStats() {
  const [genCounts, pubCounts] = await Promise.all([
    generationQueue.getJobCounts(),
    publishQueue.getJobCounts(),
  ])
  return { generation: genCounts, publish: pubCounts }
}
