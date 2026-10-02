import { useEffect, useRef, useState } from 'react';
import { X, Trash2, Download, Loader2 } from 'lucide-react';
import type { JobProgress } from '@shared/types';
import { cn } from '@/lib/utils';

interface JobItem {
    id: string;
    name: string;
    stage: string;
    percent?: number;
    message?: string;
    error?: string;
}

const STAGE_LABEL: Record<string, string> = {
    pending: 'Queued',
    downloading: 'Downloading',
    extracting: 'Extracting',
    installing: 'Installing',
    done: 'Done',
    error: 'Error',
    cancelled: 'Cancelled'
};

const TERMINAL_STAGES = new Set(['done', 'error', 'cancelled']);

export function DownloadsPanel(): React.JSX.Element {
    const [jobs, setJobs] = useState<Map<string, JobItem>>(new Map());
    const [open, setOpen] = useState(true);
    const cleanupTimers = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        const off = window.api.banana.onJobProgress((p) => {
            setJobs((prev) => {
                const next = new Map(prev);
                const item: JobItem = {
                    id: p.id,
                    name: p.name,
                    stage: p.stage,
                    percent: p.percent,
                    message: p.message,
                    error: p.error
                };
                next.set(p.id, item);

                // auto-remove terminal jobs after delay
                if (TERMINAL_STAGES.has(p.stage)) {
                    const existing = cleanupTimers.current.get(p.id);
                    if (existing) window.clearTimeout(existing);
                    const t = window.setTimeout(() => {
                        setJobs((cur) => {
                            const n = new Map(cur);
                            n.delete(p.id);
                            return n;
                        });
                        cleanupTimers.current.delete(p.id);
                    }, 6000);
                    cleanupTimers.current.set(p.id, t);
                }
                return next;
            });
        });
        return () => {
            off();
            for (const t of cleanupTimers.current.values()) window.clearTimeout(t);
        };
    }, []);

    const jobsArr = Array.from(jobs.values());
    const runningCount = jobsArr.filter((j) => !TERMINAL_STAGES.has(j.stage)).length;

    if (jobsArr.length === 0) return null;

    const cancelJob = (id: string): void => {
        void window.api.banana.cancelJob(id);
    };

    const clearJob = (id: string): void => {
        void window.api.banana.clearJob(id);
        setJobs((prev) => {
            const n = new Map(prev);
            n.delete(id);
            return n;
        });
    };

    const clearDone = (): void => {
        void window.api.banana.clearCompleted();
        setJobs((prev) => {
            const n = new Map(prev);
            for (const [id, j] of n) {
                if (TERMINAL_STAGES.has(j.stage)) n.delete(id);
            }
            return n;
        });
    };

    return (
        <div className={cn(
            'shrink-0 border-t bg-muted/40 backdrop-blur-sm transition-all duration-200',
            open ? 'max-h-72' : 'max-h-10'
        )}>
            <div className="flex items-center justify-between px-3 py-1.5">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className="flex items-center gap-2 text-sm font-medium hover:text-primary"
                >
                    <Download className={cn('h-4 w-4', runningCount > 0 && 'animate-bounce')} />
                    Downloads
                    {runningCount > 0 && (
                        <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                            {runningCount}
                        </span>
                    )}
                </button>
                <div className="flex items-center gap-1">
                    {open && jobsArr.some((j) => TERMINAL_STAGES.has(j.stage)) && (
                        <button
                            type="button"
                            onClick={clearDone}
                            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                            title="Clear completed"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                        title={open ? 'Collapse' : 'Expand'}
                    >
                        <span className="text-xs">{open ? '▼' : '▲'}</span>
                    </button>
                </div>
            </div>

            {open && (
                <div className="max-h-60 space-y-1.5 overflow-y-auto px-3 pb-2">
                    {jobsArr.map((job) => {
                        const isTerminal = TERMINAL_STAGES.has(job.stage);
                        const isError = job.stage === 'error';
                        const isDone = job.stage === 'done';
                        const pct = job.percent;

                        return (
                            <div
                                key={job.id}
                                className={cn(
                                    'rounded-md border px-2.5 py-2 transition-colors',
                                    isError && 'border-destructive/40 bg-destructive/5',
                                    isDone && 'border-green-500/30 bg-green-500/5',
                                    !isTerminal && 'border-border bg-background'
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        {!isTerminal && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
                                        <span className="truncate text-sm font-medium">{job.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {!isTerminal ? (
                                            <button
                                                type="button"
                                                onClick={() => cancelJob(job.id)}
                                                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                                                title="Cancel"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => clearJob(job.id)}
                                                className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                                title="Remove"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                        className={cn(
                                            'h-full transition-all duration-300',
                                            isError ? 'bg-destructive' : isDone ? 'bg-green-500' : 'bg-primary'
                                        )}
                                        style={{
                                            width: pct !== undefined ? `${pct}%` : '0%',
                                            opacity: pct === undefined ? 0.3 : 1
                                        }}
                                    />
                                </div>

                                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                                    <span className="truncate">
                                        {isError ? (job.error || 'Failed') : job.message || STAGE_LABEL[job.stage] || job.stage}
                                    </span>
                                    {pct !== undefined && (
                                        <span className="shrink-0 tabular-nums">{pct}%</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
