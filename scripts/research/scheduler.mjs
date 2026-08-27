import PQueue from "p-queue";
import pRetry, { AbortError } from "p-retry";

import { ProviderError } from "./providers.mjs";

export function queues() {
  return {
    exaSearch: new PQueue({ concurrency: 4, intervalCap: 8, interval: 1000, strict: true }),
    exaContents: new PQueue({ concurrency: 8, intervalCap: 80, interval: 1000, strict: true }),
    brave: new PQueue({ concurrency: 1, intervalCap: 1, interval: 1000, strict: true }),
    perplexity: new PQueue({ concurrency: 1, intervalCap: 1, interval: 1000, strict: true }),
  };
}
function delay(error, attempt) {
  const server = error?.retryAfterMs;
  if (Number.isFinite(server)) return Math.min(300_000, Math.max(0, server));
  return Math.min(300_000, 500 * 2 ** (attempt - 1) + Math.random() * 500);
}
export async function request(queue, operation, { onRetry } = {}) {
  return queue.add(() => pRetry(operation, {
    retries: 3,
    factor: 2,
    minTimeout: 500,
    maxTimeout: 5000,
    maxRetryTime: 30_000,
    shouldRetry: ({ error }) => error instanceof ProviderError && error.retryable,
    onFailedAttempt: async ({ error, attemptNumber }) => {
      if (error instanceof ProviderError && error.uncertain) throw new AbortError(error.message);
      const wait = delay(error, attemptNumber);
      await onRetry?.({ error, attemptNumber, wait });
      await new Promise((resolve) => setTimeout(resolve, wait));
    },
  }));
}
export async function idle(allQueues) { await Promise.all(Object.values(allQueues).map((queue) => queue.onIdle())); }
