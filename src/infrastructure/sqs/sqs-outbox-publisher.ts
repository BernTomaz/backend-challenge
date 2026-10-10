import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { OutboxPublisher } from "../database/publish-outbox-messages";

export class SqsOutboxPublisher implements OutboxPublisher {
  constructor(
    private readonly sqs: Pick<SQSClient, "send">,
    private readonly queueUrl: string,
  ) {}

  async publish(payload: Record<string, unknown>): Promise<void> {
    await this.sqs.send(new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(payload),
      MessageGroupId: String(payload.aggregateId),
      MessageDeduplicationId: String(payload.eventId),
    }));
  }
}
