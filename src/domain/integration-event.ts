export interface IntegrationEvent<T> {
  eventId: string;
  aggregateId: string;
  eventType: string;
  occurredAt: Date;
  toJSON(): {
    eventId: string;
    eventType: string;
    aggregateId: string;
    occurredAt: string;
    data: T;
  };
}
