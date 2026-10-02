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

// Character progress bar: | green █ filled + gray ░ empty |
function CharProgress({ percent }: { percent: number }): React.JSX.Element {
    const width = 18;
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return (
        <span className="font-mono text-[11px] leading-none">
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
        // 右下角定位，小尺寸
        <div
            className={cn(
                'pointer-events-auto fixed right-4 bottom-4 z-50 w-72 transition-transform duration-300 ease-out',
                // 默认在屏幕下方静静待着，只露出 32px
                'translate-y-[calc(100%-32px)]',
                'hover:translate-y-0'
            )}
        >
            {/* 背景图层 — 缩放到面板大小 */}
            <div
                className="relative overflow-hidden"
                style={{
                    backgroundImage: `url(${downloadsBg})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    padding: '12px',
                }}
            >
                {/* 内容层 — 纯黑字，无任何背景 */}
                <div className="relative text-black">
                    {/* 标题栏 */}
                    <div className="mb-2 flex items-center justify-between text-black">
                        <div className="flex items-center gap-2 text-xs font-bold">
                            <span>📥</span>
                            <span>Downloads</span>
                            {runningCount > 0 && (
                                <span className="font-mono text-[11px] text-black">
                                    ({runningCount})
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {jobsArr.some((j) => TERMINAL_STAGES.has(j.stage)) && (
                                <button
                                    type="button"
                                    onClick={clearDone}
                                    className="rounded p-0.5 text-black hover:underline"
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
                                    {/* 状态图标 */}
                                    <div className="shrink-0 text-black">
                                        {!isTerminal ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : isError ? (
                                            <span className="font-bold">✗</span>
                                        ) : isDone ? (
                                            <span className="font-bold">✓</span>
                                        ) : (
                                            <span>✦</span>
                                        )}
                                    </div>

                                    {/* 名字 + 字符进度条 */}
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="truncate font-semibold text-black">{job.name}</span>
                                        <div className="flex items-center gap-2">
                                            {pct !== undefined ? (
                                                <CharProgress percent={pct} />
                                            ) : (
                                                <span className="font-mono text-[11px] text-black">|░░░░░░░░░░░░░░░░░░░░ --%|</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 操作按钮 */}
                                    <div className="shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => isTerminal ? clearJob(job.id) : cancelJob(job.id)}
                                            className="rounded p-0.5 text-black hover:underline"
                                            title={isTerminal ? 'Remove' : 'Cancel'}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 收起状态提示条 */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex h-8 items-center justify-center text-[10px] font-semibold text-black">
                        {runningCount > 0
                            ? `${runningCount} downloading...`
                            : `${jobsArr.length} done (hover ↑)`}
                    </div>
                </div>
            </div>
        </div>
    );
}
