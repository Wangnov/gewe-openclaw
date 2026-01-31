const DEFAULT_MIN_DELAY_MS = 3000;
const DEFAULT_MAX_DELAY_MS = 10000;
const DEDUPE_TTL_MS = 12 * 60 * 60 * 1000;

export type GeweDownloadJob = {
  key: string;
  run: () => Promise<void>;
};

export class GeweDownloadQueue {
  private readonly queue: GeweDownloadJob[] = [];
  private readonly seen = new Map<string, number>();
  private running = false;
  private minDelayMs: number;
  private maxDelayMs: number;

  constructor(opts?: { minDelayMs?: number; maxDelayMs?: number }) {
    this.minDelayMs = opts?.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
    this.maxDelayMs = opts?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  }

  updateDelayRange(minDelayMs?: number, maxDelayMs?: number) {
    if (typeof minDelayMs === "number" && minDelayMs >= 0) {
      this.minDelayMs = minDelayMs;
    }
    if (typeof maxDelayMs === "number" && maxDelayMs >= 0) {
      this.maxDelayMs = maxDelayMs;
    }
  }

  enqueue(job: GeweDownloadJob): boolean {
    this.cleanup();
    if (this.seen.has(job.key)) return false;
    this.seen.set(job.key, Date.now());
    this.queue.push(job);
    void this.run();
    return true;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, ts] of this.seen.entries()) {
      if (now - ts > DEDUPE_TTL_MS) {
        this.seen.delete(key);
      }
    }
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();
        if (!job) continue;
        await sleep(this.nextDelayMs());
        await job.run();
      }
    } finally {
      this.running = false;
    }
  }

  private nextDelayMs(): number {
    const min = Math.max(0, this.minDelayMs);
    const max = Math.max(min, this.maxDelayMs);
    if (max === min) return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
