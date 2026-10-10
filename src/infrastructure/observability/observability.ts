export interface LogFields {
  correlationId?: string;
  messageId?: string;
  transactionId?: string;
  walletId?: string;
  providerId?: string;
  [key: string]: unknown;
}

export const metrics = {
  transactionsByStatus: new Map<string, number>(),
  duplicatesDetected: 0,
  retries: 0,
  dlqMessages: 0,
  lockConflicts: 0,
  outboxLagMs: 0,
  processingLatencyMs: 0,
  reconciliationDivergences: 0,
};

export function incrementTransactionStatus(status: string): void {
  metrics.transactionsByStatus.set(status, (metrics.transactionsByStatus.get(status) ?? 0) + 1);
}

export function metricsSnapshot(): Record<string, unknown> {
  return {
    transactionsByStatus: Object.fromEntries(metrics.transactionsByStatus),
    duplicatesDetected: metrics.duplicatesDetected,
    retries: metrics.retries,
    dlqMessages: metrics.dlqMessages,
    lockConflicts: metrics.lockConflicts,
    outboxLagMs: metrics.outboxLagMs,
    processingLatencyMs: metrics.processingLatencyMs,
    reconciliationDivergences: metrics.reconciliationDivergences,
  };
}

export function logInfo(message: string, fields: LogFields = {}): void {
  console.info(JSON.stringify({ level: "info", message, ...fields }));
}

export function logWarn(message: string, fields: LogFields = {}): void {
  console.warn(JSON.stringify({ level: "warn", message, ...fields }));
}
