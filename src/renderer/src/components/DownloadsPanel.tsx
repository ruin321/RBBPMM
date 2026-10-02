import { useEffect, useRef, useState } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';
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

// 图片 480x360：上半部分（红顶 + 灰条）给头部，下半部分（白心 + 两边红框）给每一行
const BG_TOP: React.CSSProperties = {
    backgroundImage: `url(${downloadsBg})`,
    backgroundSize: '100% 360px',
    backgroundPosition: '0 0',
    backgroundRepeat: 'no-repeat',
};
const BG_BOTTOM: React.CSSProperties = {
    backgroundImage: `url(${downloadsBg})`,
    backgroundSize: '100% 360px',
    backgroundPosition: '0 100%',
    backgroundRepeat: 'no-repeat',
};

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

export function DownloadsPanel(): React.JSX.Element | null {
    const [jobs, setJobs] = useState<Map<string, JobItem>>(new Map());
    const cleanupTimers = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        const off = window.api.banana.onJobProgress((p) => {
            setJobs((prev) => {
                const next = new Map(prev);
                next.set(p.id, {
                    id: p.id,
                    name: p.name,
                    stage: p.stage,
                    percent: p.percent,
                    message: p.message,
                    error: p.error
                });
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

    const hasFinished = jobsArr.some((j) => TERMINAL_STAGES.has(j.stage));

    return (
        // 外层固定不动（保证 hover 区域稳定，不然升起后鼠标会掉出去）
        <div className="group pointer-events-auto fixed right-4 bottom-4 z-50 w-[480px] text-black">
            {/* 内层负责位移：默认只露半个头部 45px，hover 整块升起 */}
            <div className="translate-y-[calc(100%-45px)] transition-transform duration-300 ease-out group-hover:translate-y-0">
                {/* 头部 — 用图片上半部分，文本居中，无 emoji */}
                <div style={BG_TOP} className="relative flex h-[90px] items-center justify-center pt-6">
                    <span className="text-sm font-bold">Downloads</span>
                    {runningCount > 0 && (
                        <span className="ml-1.5 font-mono text-[10px] font-bold">({runningCount})</span>
                    )}
                    {hasFinished && (
                        <button
                            type="button"
                            onClick={clearDone}
                            className="absolute right-[72px] top-[57px] -translate-y-1/2 rounded p-0.5 text-black hover:bg-black/10"
                            title="Clear completed"
                        >
                            <Trash2 className="h-3 w-3" />
                        </button>
                    )}
                </div>

                {/* 每一个下载任务一行 — 用图片下半部分，多个任务就多块 */}
                {jobsArr.map((job) => {
                    const isTerminal = TERMINAL_STAGES.has(job.stage);
                    const isError = job.stage === 'error';
                    const isDone = job.stage === 'done';
                    const pct = job.percent;

                    return (
                        <div
                            key={job.id}
                            style={BG_BOTTOM}
                            className="flex h-[72px] items-center justify-end gap-2 px-[72px] text-xs"
                        >
                            <div className="shrink-0">
                                {!isTerminal ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : isError ? (
                                    <span className="text-sm font-bold">✗</span>
                                ) : isDone ? (
                                    <span className="text-sm font-bold">✓</span>
                                ) : (
                                    <span className="text-sm">✦</span>
                                )}
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5 text-right">
                                <span className="truncate font-semibold text-black">{job.name}</span>
                                <div className="flex items-center justify-end gap-2">
                                    {pct !== undefined ? (
                                        <CharProgress percent={pct} />
                                    ) : (
                                        <span className="font-mono text-xs text-black">|░░░░░░░░░░░░░░░░░░░░ --%|</span>
                                    )}
                                </div>
                                {job.message && (
                                    <span className="truncate text-[10px] text-black/70">
                                        {isError ? (job.error || 'Failed') : job.message}
                                    </span>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => isTerminal ? clearJob(job.id) : cancelJob(job.id)}
                                className="shrink-0 rounded p-0.5 text-black hover:bg-black/10"
                                title={isTerminal ? 'Remove' : 'Cancel'}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}