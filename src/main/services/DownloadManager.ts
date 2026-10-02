import crypto from 'crypto';

export type JobStatus = 'pending' | 'downloading' | 'extracting' | 'installing' | 'done' | 'error' | 'cancelled';

export interface JobProgress {
    id: string;
    name: string;
    stage: JobStatus;
    percent?: number;
    message?: string;
    error?: string;
}

export interface DownloadJob {
    id: string;
    name: string;
    status: JobStatus;
    percent?: number;
    message?: string;
    error?: string;
    controller: AbortController;
    promise: Promise<void>;
}

type JobRunner = (controller: AbortController, onProgress: (p: Omit<JobProgress, 'id' | 'name'>) => void) => Promise<void>;

const MAX_CONCURRENT = 3;

class DownloadManager {
    private jobs = new Map<string, DownloadJob>();
    private queue: string[] = [];
    private runningCount = 0;
    private listeners = new Set<(p: JobProgress) => void>();

    subscribe(fn: (p: JobProgress) => void): () => void {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }

    private emit(p: JobProgress): void {
        for (const l of this.listeners) {
            try { l(p); } catch { /* noop */ }
        }
    }

    submit(name: string, runner: JobRunner): string {
        const id = crypto.randomBytes(6).toString('hex');
        const controller = new AbortController();

        const job: DownloadJob = {
            id,
            name,
            status: 'pending',
            controller,
            promise: Promise.resolve()
        };
        this.jobs.set(id, job);
        this.emit({ id, name, stage: 'pending' });

        job.promise = runner(controller, (p) => {
            job.status = p.stage;
            job.percent = p.percent;
            job.message = p.message;
            this.emit({ id, name, ...p });
        }).then(() => {
            if (controller.signal.aborted) {
                job.status = 'cancelled';
                this.emit({ id, name, stage: 'cancelled' });
            } else {
                job.status = 'done';
                job.percent = 100;
                this.emit({ id, name, stage: 'done', percent: 100 });
            }
        }).catch((err) => {
            if (controller.signal.aborted) {
                job.status = 'cancelled';
                this.emit({ id, name, stage: 'cancelled' });
            } else {
                job.status = 'error';
                job.error = err instanceof Error ? err.message : String(err);
                this.emit({ id, name, stage: 'error', error: job.error });
            }
        }).finally(() => {
            this.runningCount--;
            this.tryRunNext();
        });

        this.queue.push(id);
        this.tryRunNext();
        return id;
    }

    private tryRunNext(): void {
        while (this.runningCount < MAX_CONCURRENT && this.queue.length > 0) {
            const id = this.queue.shift()!;
            const job = this.jobs.get(id);
            if (!job || job.controller.signal.aborted) continue;
            this.runningCount++;
        }
    }

    cancel(id: string): boolean {
        const job = this.jobs.get(id);
        if (!job) return false;
        if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') return false;
        job.controller.abort();
        return true;
    }

    cancelAll(): void {
        for (const job of this.jobs.values()) {
            this.cancel(job.id);
        }
    }

    remove(id: string): void {
        this.jobs.delete(id);
    }

    clearCompleted(): void {
        for (const [id, job] of this.jobs) {
            if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
                this.jobs.delete(id);
            }
        }
    }

    getJob(id: string): DownloadJob | undefined {
        return this.jobs.get(id);
    }

    getAll(): DownloadJob[] {
        return Array.from(this.jobs.values());
    }
}

export const downloadManager = new DownloadManager();
