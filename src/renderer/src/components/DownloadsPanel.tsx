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

// Character-based progress bar: green █ filled + gray ░ empty
function CharProgress({ percent }: { percent: number }): React.JSX.Element {
    const width = 20;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return (
        <span className="font-mono text-[11px] leading-none tracking-[0.5px]">
            <span style={{ color: '#22c55e' }}>{'█'.repeat(filled)}</span>
            <span style={{ color: '#6b7280' }}>{'░'.repeat(empty)}</span>
            <span className="ml-1 text-xs text-foreground">{percent}%</span>
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
                'pointer-events-auto fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl p-2 transition-transform duration-300 ease-out',
                // 默认在屏幕底部静静待着，只露出顶部一点点
                // hover 时 transform 变回 0% 完整升上来
                'translate-y-[calc(100%-36px)]',
                'hover:translate-y-0'
            )}
        >
            {/* 背景图层 */}
            <div
                className="relative rounded-lg overflow-hidden"
                style={{
                    backgroundImage: `url(${downloadsBg})`,
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                }}
            >
                {/* 内容层 */}
                <div className="relative p-4 pt-6">
                    {/* 标题栏 */}
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <span>📥</span>
                            <span>Downloads</span>
                            {runningCount > 0 && (
                                <span className="rounded bg-green-600/20 px-1.5 py-0.5 text-xs font-mono text-green-600">
                                    {runningCount}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {jobsArr.some((j) => TERMINAL_STAGES.has(j.stage)) && (
                                <button
                                    type="button"
                                    onClick={clearDone}
                                    className="rounded p-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                                    title="Clear completed"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 卡片列表 */}
                    <div className="space-y-2">
                        {jobsArr.map((job) => {
                            const isTerminal = TERMINAL_STAGES.has(job.stage);
                            const isError = job.stage === 'error';
                            const isDone = job.stage === 'done';
                            const pct = job.percent;

                            return (
                                <div
                                    key={job.id}
                                    className={cn(
                                        'flex items-center gap-3 rounded border px-3 py-2 text-sm',
                                        'bg-background/80 backdrop-blur-sm',
                                        isError && 'border-red-400/60 bg-red-50/90',
                                        isDone && 'border-green-400/60 bg-green-50/90',
                                    )}
                                >
                                    {/* 状态图标 */}
                                    <div className="shrink-0">
                                        {!isTerminal ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                                        ) : isError ? (
                                            <span className="text-red-500 text-lg leading-none">✗</span>
                                        ) : isDone ? (
                                            <span className="text-green-600 text-lg leading-none">✓</span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">✦</span>
                                        )}
                                    </div>

                                    {/* 名字 + 字符进度条 */}
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="truncate font-medium">{job.name}</span>
                                        <div className="flex items-center gap-2">
                                            {pct !== undefined ? (
                                                <CharProgress percent={pct} />
                                            ) : (
                                                <span className="font-mono text-xs text-gray-500">░░░░░░░░░░░░░░░░░░░░  --%</span>
                                            )}
                                            {job.message && (
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {isError ? (job.error || 'Failed') : job.message}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 操作按钮 */}
                                    <div className="shrink-0">
                                        {!isTerminal ? (
                                            <button
                                                type="button"
                                                onClick={() => cancelJob(job.id)}
                                                className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600"
                                                title="Cancel"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => clearJob(job.id)}
                                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                                title="Remove"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* hover 提示条（收起状态下露出来的那一条） */}
                    <div className="pointer-events-none absolute left-0 right-0 top-0 h-9 flex items-center justify-center text-[11px] text-muted-foreground/70">
                        {runningCount > 0
                            ? `${runningCount} downloading...`
                            : `${jobsArr.length} completed (hover to view)`}
                    </div>
                </div>
            </div>
        </div>
    );
}
