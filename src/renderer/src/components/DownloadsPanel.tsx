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
    const width = 20;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return (
        <span className="font-mono text-xs leading-none">
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
        <div className="pointer-events-auto fixed right-4 bottom-4 z-50">
            {/* 九宫格：固定尺寸，不自动伸缩 */}
            <div
                style={{
                    borderStyle: 'solid',
                    borderWidth: '10px',
                    borderImageSource: `url(${downloadsBg})`,
                    borderImageSlice: '10 fill',
                    borderImageWidth: '10',
                    width: 480,
                }}
            >
                {/* 内容区：padding 匹配 slice，让文字待在图片白心里 */}
                <div className="px-3 py-2 text-black">
                    {/* 标题栏 */}
                    <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-sm font-bold">
                            <span>📥</span>
                            <span>Downloads</span>
                            {runningCount > 0 && (
                                <span className="rounded bg-black/10 px-1 py-0.5 font-mono text-[10px] text-black">
                                    ({runningCount})
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {jobsArr.some((j) => TERMINAL_STAGES.has(j.stage)) && (
                                <button
                                    type="button"
                                    onClick={clearDone}
                                    className="rounded p-0.5 text-black hover:bg-black/10"
                                    title="Clear completed"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 列表 */}
                    <div className="space-y-1.5">
                        {jobsArr.map((job) => {
                            const isTerminal = TERMINAL_STAGES.has(job.stage);
                            const isError = job.stage === 'error';
                            const isDone = job.stage === 'done';
                            const pct = job.percent;

                            return (
                                <div key={job.id} className="flex items-center gap-2 text-xs">
                                    <div className="shrink-0 text-black">
                                        {!isTerminal ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : isError ? (
                                            <span className="font-bold text-sm">✗</span>
                                        ) : isDone ? (
                                            <span className="font-bold text-sm">✓</span>
                                        ) : (
                                            <span className="text-sm">✦</span>
                                        )}
                                    </div>

                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="truncate font-semibold text-black">{job.name}</span>
                                        <div className="flex items-center gap-2">
                                            {pct !== undefined ? (
                                                <CharProgress percent={pct} />
                                            ) : (
                                                <span className="font-mono text-xs text-black">|░░░░░░░░░░░░░░░░░░░░░░░░ --%|</span>
                                            )}
                                            {job.message && (
                                                <span className="truncate text-[10px] text-black/70">
                                                    {isError ? (job.error || 'Failed') : job.message}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => isTerminal ? clearJob(job.id) : cancelJob(job.id)}
                                            className="rounded p-0.5 text-black hover:bg-black/10"
                                            title={isTerminal ? 'Remove' : 'Cancel'}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
