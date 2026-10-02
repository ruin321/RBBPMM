import crypto from 'crypto';
import type { JobKind, JobProgress } from '../../shared/types';

export interface InstallProgressUpdate {
    stage: string;
    percent?: number;
    message?: string;
}

/**
 * Install jobs are executed by their own services (they are not submitted to
 * DownloadManager) — this only tracks them so the install panel can show
 * progress from every install source in one place.
 */
class InstallTracker {
    private jobs = new Map<string, JobProgress>();
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

    private patch(id: string, p: Partial<JobProgress> & {
        kind?: JobKind;
    }): void {
        const job = this.jobs.get(id);
        if (!job)
            return;
        Object.assign(job, p);
        this.emit({ ...job });
    }

    begin(name: string): string {
        const id = crypto.randomBytes(6).toString('hex');
        const job: JobProgress = { id, name, kind: 'install', stage: 'pending' };
        this.jobs.set(id, job);
        this.emit({ ...job });
        return id;
    }

    progress(id: string, p: InstallProgressUpdate): void {
        this.patch(id, {
            stage: p.stage,
            percent: p.percent,
            message: p.message
        });
    }

    done(id: string, message?: string): void {
        this.patch(id, { stage: 'done', percent: 100, message });
    }

    fail(id: string, error: string): void {
        this.patch(id, { stage: 'error', error, message: error });
    }

    remove(id: string): void {
        this.jobs.delete(id);
    }

    clearCompleted(): void {
        for (const [id, job] of this.jobs) {
            if (job.stage === 'done' || job.stage === 'error') {
                this.jobs.delete(id);
            }
        }
    }

    getAll(): JobProgress[] {
        return Array.from(this.jobs.values()).map((j) => ({ ...j }));
    }
}

export const installTracker = new InstallTracker();
