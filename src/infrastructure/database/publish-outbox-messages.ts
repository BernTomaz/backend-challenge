import { EntityManager } from "@mikro-orm/postgresql";
import { logInfo, metrics } from "../observability/observability";
import { OutboxMessageRecord } from "./entities/outbox-message.record";

export interface OutboxPublisher {
  publish(payload: Record<string, unknown>): Promise<void>;
}

export interface PublishOutboxMessagesInput {
  em: EntityManager;
  publisher: OutboxPublisher;
  now?: Date;
  limit?: number;
}

export async function publishDueOutboxMessages(
  input: PublishOutboxMessagesInput,
): Promise<number> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 10;

  return input.em.transactional(async (tx) => {
    const rows = await tx.execute<{ id: string }[]>(
      `
        select id
        from outbox_messages
        where published_at is null
          and (next_attempt_at is null or next_attempt_at <= ?)
        order by occurred_at asc
        limit ?
        for update skip locked
      `,
      [now, limit],
    );
    const ids = rows.map((row) => row.id);

    if (ids.length === 0) {
      return 0;
    }

    const messages = await tx.find(OutboxMessageRecord, { id: { $in: ids } });
    let published = 0;

    for (const message of messages) {
      try {
        await input.publisher.publish(message.payload);
        message.publishedAt = now;
        metrics.outboxLagMs = now.getTime() - message.occurredAt.getTime();
        logInfo("outbox_message_published", {
          correlationId: String(message.payload.correlationId ?? ""),
          transactionId: transactionIdFrom(message.payload),
          walletId: message.aggregateId,
          eventType: message.eventType,
        });
        published += 1;
      } catch {
        message.attempts += 1;
        metrics.retries += 1;
        message.nextAttemptAt = new Date(now.getTime() + Math.min(2 ** message.attempts, 300) * 1000);
      }
    }

    return published;
  });
}

function transactionIdFrom(payload: Record<string, unknown>): string | undefined {
  const data = payload.data as { transactionId?: string } | undefined;

  return data?.transactionId;
}
