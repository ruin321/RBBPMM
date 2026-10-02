import { useEffect, useRef, useState } from 'react';
import { X, Trash2, Download, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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

const TERMINAL_STAGES = new Set(['done', 'error', 'cancelled']);

export function DownloadsPanel(): React.JSX.Element {
    const [jobs, setJobs] = useState<Map<string, JobItem>>(new Map());
    const [open, setOpen] = useState(false);
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
                } else {
                    // auto-open on new download
                    setOpen(true);
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

    // Floating trigger button when closed + has jobs
    if (jobsArr.length === 0) return null;

    return (<div className="pointer-events-none fixed right-4 bottom-4 z-50 flex items-end gap-2">
        {/* Trigger button when collapsed */}
        {!open && (<button type="button" onClick={() => setOpen(true)} className="pointer-events-auto flex items-center gap-1.5 rounded-full border bg-popover px-3 py-2 shadow-lg transition-all hover:scale-105 hover:bg-accent">
            <Download className={cn('h-4 w-4', runningCount > 0 && 'animate-bounce text-primary')}/>
            <span className="text-xs font-medium">
                {runningCount > 0 ? `${runningCount} downloading` : `${jobsArr.length} done`}
            </span>
        </button>)}

        {/* Sliding panel */}
        <div className={cn(
            'pointer-events-auto flex w-80 max-h-[70vh] flex-col overflow-hidden rounded-xl border bg-popover shadow-2xl transition-all duration-300 ease-out',
            open
                ? 'translate-x-0 opacity-100'
                : 'translate-x-4 opacity-0 pointer-events-none'
        )}>
            <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="flex items-center gap-2">
                    <Download className={cn('h-4 w-4', runningCount > 0 ? 'text-primary' : 'text-muted-foreground')}/>
                    <span className="text-sm font-semibold">Downloads</span>
                    {runningCount > 0 && (
                        <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            {runningCount}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-0.5">
                    {jobsArr.some((j) => TERMINAL_STAGES.has(j.stage)) && (
                        <button type="button" onClick={clearDone} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Clear completed">
                            <Trash2 className="h-3.5 w-3.5"/>
                        </button>
                    )}
                    <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Collapse">
                        <ChevronRight className="h-3.5 w-3.5"/>
                    </button>
                </div>
            </div>

            <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
                {jobsArr.map((job) => {
                    const isTerminal = TERMINAL_STAGES.has(job.stage);
                    const isError = job.stage === 'error';
                    const isDone = job.stage === 'done';
                    const pct = job.percent;

                    return (<div key={job.id} className={cn(
                        'rounded-lg border p-2 transition-colors',
                        isError && 'border-destructive/40 bg-destructive/5',
                        isDone && 'border-green-500/30 bg-green-500/5',
                        !isTerminal && 'border-border bg-background/60'
                    )}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                {!isTerminal && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary"/>}
                                <span className="truncate text-xs font-medium">{job.name}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                                {!isTerminal ? (
                                    <button type="button" onClick={() => cancelJob(job.id)} className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Cancel">
                                        <X className="h-3 w-3"/>
                                    </button>
                                ) : (
                                    <button type="button" onClick={() => clearJob(job.id)} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Remove">
                                        <X className="h-3 w-3"/>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div className={cn(
                                'h-full transition-all duration-300',
                                isError ? 'bg-destructive' : isDone ? 'bg-green-500' : 'bg-primary'
                            )} style={{
                                width: pct !== undefined ? `${pct}%` : '0%',
                                opacity: pct === undefined ? 0.3 : 1
                            }}/>
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="truncate">
                                {isError ? (job.error || 'Failed') : job.message || job.stage}
                            </span>
                            {pct !== undefined && (
                                <span className="shrink-0 tabular-nums font-mono">{pct}%</span>
                            )}
                        </div>
                    </div>);
                })}
            </div>

            {/* Drag handle / collapse hint */}
            <button type="button" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1 border-t py-1 text-[10px] text-muted-foreground hover:bg-accent">
                <ChevronLeft className="h-3 w-3"/>
                <span>Click outside to collapse</span>
            </button>
        </div>
    </div>);
}
