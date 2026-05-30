/** Limits concurrent in-flight RPC/fetch work to avoid main-thread pile-ups. */

export const REQUEST_QUEUE_CONCURRENCY = 4;

type Task<T> = {
  run: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

class RequestQueue {
  private readonly concurrency = REQUEST_QUEUE_CONCURRENCY;
  private running = 0;
  private pending: Task<unknown>[] = [];

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({ run: fn, resolve: resolve as (v: unknown) => void, reject });
      this.drain();
    });
  }

  get stats(): { running: number; pending: number } {
    return { running: this.running, pending: this.pending.length };
  }

  private drain(): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift();
      if (!task) break;
      this.running += 1;
      void task
        .run()
        .then(task.resolve, task.reject)
        .finally(() => {
          this.running -= 1;
          this.drain();
        });
    }
  }
}

export const requestQueue = new RequestQueue();
