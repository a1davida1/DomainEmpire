const DEFAULT_WORKER_BATCH_SIZE = 10;
const MIN_WORKER_BATCH_SIZE = 1;
const MAX_WORKER_BATCH_SIZE = 200;

export function parseWorkerBatchSize(rawValue: string | undefined): number {
    const parsed = Number.parseInt(rawValue ?? '', 10);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_WORKER_BATCH_SIZE;
    }

    return Math.min(MAX_WORKER_BATCH_SIZE, Math.max(MIN_WORKER_BATCH_SIZE, parsed));
}
