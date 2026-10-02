import { useEffect, useRef, useState } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';
import type { JobProgress } from '@shared/types';
import { cn } from '@/lib/utils';
import downloadsBg from '@/assets/downloads-bg.png';

interface JobItem {
    id: string;
    name: string;
    stage: string;
    percent?: number;
    message?: string;
    error?: string;
}

const TERMINAL_STAGES = new Set(['done', 'error', 'cancelled']);

function CharProgress({ percent }: { percent: number }): React.JSX.Element {
    const width = 24;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return (
        <span className="font-mono text-sm leading-none">
            <span style={{ color: '#111' }}>|</span>
            <span style={{ color: '#16a34a' }}>{'█'.repeat(filled)}</span>
            <span style={{ color: '#6b7280' }}>{'░'.repeat(empty)}</span>
            <span style={{ color: '#111' }}>|</span>
            <span style={{ color: '#111' }}> {percent}%</span>
        </span>
    );
}

export function DownloadsPanel(): React.JSX.Element {
    const [jobs, setJobs] = useState<Map<string, JobItem>>(new Map());
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
                    }, 8000);
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

    const cancelJob = (id: string): void => { void window.api.banana.cancelJob(id); };
    const clearJob = (id: string): void => {
        void window.api.banana.clearJob(id);
        setJobs((prev) => { const n = new Map(prev); n.delete(id); return n; });
    };
    const clearDone = (): void => {
        void window.api.banana.clearCompleted();
        setJobs((prev) => {
            const n = new Map(prev);
            for (const [id, j] of n) if (TERMINAL_STAGES.has(j.stage)) n.delete(id);
            return n;
        });
    };

    if (jobsArr.length === 0) return null;

    return (
        <div
            className={cn(
                'pointer-events-auto fixed right-4 bottom-4 z-50 transition-transform duration-300 ease-out',
                'translate-y-[calc(100%-36px)]',
                'hover:translate-y-0'
            )}
        >
            {/* 自适应宽度：按内容 min-content，限制最大 min(640px, 80vw) 防止过长 */}
            <div
                className="overflow-hidden"
                style={{
                    backgroundImage: `url(${downloadsBg})`,
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    padding: '16px',
                    width: 'min(640px, 80vw)',
                    minWidth: 360,
                }}
            >
                <div className="relative text-black">
                    {/* 标题栏 */}
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-base font-bold">
                            <span>📥</span>
                            <span>Downloads</span>
                            {runningCount > 0 && (
                                <span className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-xs text-black">
                                    ({runningCount})
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {jobsArr.some((j) => TERMINAL_STAGES.has(j.stage)) && (
                                <button
                                    type="button"
                                    onClick={clearDone}
                                    className="rounded p-1 text-black hover:bg-black/10"
                                    title="Clear completed"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 列表 */}
                    <div className="space-y-2">
                        {jobsArr.map((job) => {
                            const isTerminal = TERMINAL_STAGES.has(job.stage);
                            const isError = job.stage === 'error';
                            const isDone = job.stage === 'done';
                            const pct = job.percent;

                            return (
                                <div key={job.id} className="flex items-center gap-3 text-sm">
                                    <div className="shrink-0 text-black">
                                        {!isTerminal ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : isError ? (
                                            <span className="font-bold text-base">✗</span>
                                        ) : isDone ? (
                                            <span className="font-bold text-base">✓</span>
                                        ) : (
                                            <span>✦</span>
                                        )}
                                    </div>

                                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                                        <span className="truncate font-bold text-black">{job.name}</span>
                                        <div className="flex items-center gap-3">
                                            {pct !== undefined ? (
                                                <CharProgress percent={pct} />
                                            ) : (
                                                <span className="font-mono text-sm text-black">|░░░░░░░░░░░░░░░░░░░░░░░░ --%|</span>
                                            )}
                                            {job.message && (
                                                <span className="truncate text-xs text-black/70">
                                                    {isError ? (job.error || 'Failed') : job.message}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => isTerminal ? clearJob(job.id) : cancelJob(job.id)}
                                            className="rounded p-1 text-black hover:bg-black/10"
                                            title={isTerminal ? 'Remove' : 'Cancel'}
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 收起提示 */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex h-9 items-center justify-center text-xs font-bold text-black">
                        {runningCount > 0
                            ? `${runningCount} downloading...`
                            : `${jobsArr.length} done (hover ↑)`}
                    </div>
                </div>
            </div>
        </div>
    );
}
