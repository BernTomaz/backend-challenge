import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  InboxPayloadConflictError,
  InvalidSqsMessageError,
  processWagerTransactionMessage,
  WagerTransactionRequestedMessage,
} from "./process-wager-transaction-message";

export interface SqsWagerTransactionConsumerOptions {
  queueUrl: string;
  dlqUrl: string;
  maxAttempts?: number;
  retryVisibilityTimeoutSeconds?: number;
}

export type SqsMessageAction = "processed" | "business_error" | "retry" | "dlq" | "empty";

export class SqsWagerTransactionConsumer {
  private stopping = false;

  constructor(
    private readonly sqs: Pick<SQSClient, "send">,
    private readonly em: EntityManager,
    private readonly options: SqsWagerTransactionConsumerOptions,
  ) {}

  stop(): void {
    this.stopping = true;
  }

  async pollOnce(): Promise<SqsMessageAction> {
    const response = await this.sqs.send(new ReceiveMessageCommand({
      QueueUrl: this.options.queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 10,
      MessageSystemAttributeNames: ["ApproximateReceiveCount"],
    }));
    const message = response.Messages?.[0];

    if (!message) {
      return "empty";
    }

    return this.handleMessage(message);
  }

  async run(): Promise<void> {
    while (!this.stopping) {
      await this.pollOnce();
    }
  }

  private async handleMessage(message: Message): Promise<SqsMessageAction> {
    try {
      const body = parseBody(message);
      await processWagerTransactionMessage(this.em, body);
      await this.deleteMessage(message);
      return "processed";
    } catch (error) {
      if (isBusinessOrPermanentError(error)) {
        await this.deleteMessage(message);
        return "business_error";
      }

      if (receiveCount(message) >= (this.options.maxAttempts ?? 5)) {
        await this.moveToDlq(message);
        await this.deleteMessage(message);
        return "dlq";
      }

      await this.deferRetry(message);
      return "retry";
    }
  }

  private async deleteMessage(message: Message): Promise<void> {
    if (!message.ReceiptHandle) {
      return;
    }

    await this.sqs.send(new DeleteMessageCommand({
      QueueUrl: this.options.queueUrl,
      ReceiptHandle: message.ReceiptHandle,
    }));
  }

  private async deferRetry(message: Message): Promise<void> {
    if (!message.ReceiptHandle) {
      return;
    }

    await this.sqs.send(new ChangeMessageVisibilityCommand({
      QueueUrl: this.options.queueUrl,
      ReceiptHandle: message.ReceiptHandle,
      VisibilityTimeout: this.options.retryVisibilityTimeoutSeconds ?? 30,
    }));
  }

  private async moveToDlq(message: Message): Promise<void> {
    await this.sqs.send(new SendMessageCommand({
      QueueUrl: this.options.dlqUrl,
      MessageBody: message.Body ?? "",
    }));
  }
}

function parseBody(message: Message): WagerTransactionRequestedMessage {
  try {
    return JSON.parse(message.Body ?? "") as WagerTransactionRequestedMessage;
  } catch {
    throw new InvalidSqsMessageError("Invalid message body");
  }
}

function receiveCount(message: Message): number {
  return Number(message.Attributes?.ApproximateReceiveCount ?? 1);
}

function isBusinessOrPermanentError(error: unknown): boolean {
  return error instanceof InvalidSqsMessageError || error instanceof InboxPayloadConflictError;
}
