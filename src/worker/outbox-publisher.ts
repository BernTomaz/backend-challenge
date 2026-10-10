import "reflect-metadata";
import { GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "../infrastructure/database/mikro-orm.config";
import { publishDueOutboxMessages } from "../infrastructure/database/publish-outbox-messages";
import { SqsOutboxPublisher } from "../infrastructure/sqs/sqs-outbox-publisher";

let stopping = false;
process.once("SIGTERM", () => { stopping = true; });
process.once("SIGINT", () => { stopping = true; });

const sqs = new SQSClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  endpoint: process.env.SQS_ENDPOINT ?? "http://localhost:4566",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
  },
});
const queueUrl = await queueUrlFor(process.env.OUTBOX_EVENTS_QUEUE_NAME ?? "integration-events.fifo");
const orm = await MikroORM.init(config);
const publisher = new SqsOutboxPublisher(sqs, queueUrl);

try {
  while (!stopping) {
    await publishDueOutboxMessages({
      em: orm.em.fork(),
      publisher,
      limit: Number(process.env.OUTBOX_PUBLISH_BATCH_SIZE ?? 10),
    });
    await new Promise((resolve) =>
      setTimeout(resolve, Number(process.env.OUTBOX_PUBLISH_INTERVAL_MS ?? 1000)),
    );
  }
} finally {
  await orm.close(true);
}

async function queueUrlFor(queueName: string): Promise<string> {
  const response = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));

  if (!response.QueueUrl) {
    throw new Error(`Queue not found: ${queueName}`);
  }

  return response.QueueUrl;
}
