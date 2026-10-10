import "reflect-metadata";
import { GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "../infrastructure/database/mikro-orm.config";
import { SqsWagerTransactionConsumer } from "../infrastructure/sqs/sqs-wager-transaction-consumer";

const sqs = new SQSClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  endpoint: process.env.SQS_ENDPOINT ?? "http://localhost:4566",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
  },
});
const [queueUrl, dlqUrl] = await Promise.all([
  queueUrlFor(process.env.WAGER_TRANSACTIONS_QUEUE_NAME ?? "wager-transactions.fifo"),
  queueUrlFor(process.env.WAGER_TRANSACTIONS_DLQ_NAME ?? "wager-transactions-dlq.fifo"),
]);
const orm = await MikroORM.init(config);
const consumer = new SqsWagerTransactionConsumer(sqs, orm.em.fork(), {
  queueUrl,
  dlqUrl,
  maxAttempts: Number(process.env.SQS_MAX_ATTEMPTS ?? 5),
  retryVisibilityTimeoutSeconds: Number(process.env.SQS_RETRY_VISIBILITY_TIMEOUT_SECONDS ?? 30),
});

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

try {
  await consumer.run();
} finally {
  await orm.close(true);
}

function shutdown(): void {
  consumer.stop();
}

async function queueUrlFor(queueName: string): Promise<string> {
  const response = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));

  if (!response.QueueUrl) {
    throw new Error(`Queue not found: ${queueName}`);
  }

  return response.QueueUrl;
}
