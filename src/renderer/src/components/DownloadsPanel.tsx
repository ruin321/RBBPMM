import { useEffect, useState } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';
import downloadsBg from '@/assets/downloads-bg.png';
import type { JobKind, JobProgress } from '@shared/types';

const TERMINAL_STAGES = new Set(['done', 'error', 'cancelled']);

const HEADER_H = 72;
const ROW_H = 72;
const VISIBLE_H = HEADER_H; 

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

function JobsPanel({ kind, title }: {
    kind: JobKind;
    title: string;
}): React.JSX.Element | null {
    const [jobs, setJobs] = useState<Map<string, JobProgress>>(new Map());
    const isDownload = kind === 'download';

    useEffect(() => {
        const upsert = (p: JobProgress): void => {
            if ((p.kind ?? 'download') !== kind)
                return;
            setJobs((prev) => {
                const next = new Map(prev);
                next.set(p.id, p);
                return next;
            });
        };

        const off = isDownload
            ? window.api.banana.onJobProgress(upsert)
            : window.api.install.onJobProgress(upsert);

        void (isDownload ? window.api.banana.getJobs() : window.api.install.getJobs())
            .then((list) => {
                for (const p of list) upsert(p);
            })
            .catch(() => {  });

        return () => off();
    }, [kind, isDownload]);

    const jobsArr = Array.from(jobs.values());
    const runningCount = jobsArr.filter((j) => !TERMINAL_STAGES.has(j.stage)).length;

    const cancelJob = (id: string): void => {
        void window.api.banana.cancelJob(id);
        setJobs((prev) => {
            const n = new Map(prev);
            n.delete(id);
            return n;
        });
    };
    const clearJob = (id: string): void => {
        void (isDownload ? window.api.banana.clearJob(id) : window.api.install.clearJob(id));
        setJobs((prev) => {
            const n = new Map(prev);
            n.delete(id);
            return n;
        });
    };
    const clearDone = (): void => {
        void (isDownload ? window.api.banana.clearCompleted() : window.api.install.clearCompleted());
        setJobs((prev) => {
            const n = new Map(prev);
            for (const [id, j] of n) if (TERMINAL_STAGES.has(j.stage)) n.delete(id);
            return n;
        });
    };

    if (jobsArr.length === 0) return null;

    const hasFinished = jobsArr.some((j) => TERMINAL_STAGES.has(j.stage));
    const panelH = HEADER_H + jobsArr.length * ROW_H;

    return (
        <div
            className="group pointer-events-auto relative w-[480px] text-black"
            style={{ height: VISIBLE_H, ['--panel-h' as string]: `${panelH}px` }}
        >
            {}
            <div className="absolute bottom-0 left-0 w-full translate-y-[calc(var(--panel-h)-72px)] transition-transform duration-300 ease-out group-hover:translate-y-0">
                {}
                <div style={BG_TOP} className="relative flex h-[72px] items-center justify-center pt-[50px]">
                    <span className="text-sm font-bold">{title}</span>
                    {runningCount > 0 && (
                        <span className="ml-1.5 font-mono text-[10px] font-bold">({runningCount})</span>
                    )}
                    {hasFinished && (
                        <button
                            type="button"
                            onClick={clearDone}
                            className="absolute right-[72px] top-[61px] -translate-y-1/2 rounded p-0.5 text-black hover:bg-black/10"
                            title="Clear completed"
                        >
                            <Trash2 className="h-3 w-3" />
                        </button>
                    )}
                </div>

                {}
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

                            {(isTerminal || isDownload) && (
                                <button
                                    type="button"
                                    onClick={() => isTerminal ? clearJob(job.id) : cancelJob(job.id)}
                                    className="shrink-0 rounded p-0.5 text-black hover:bg-black/10"
                                    title={isTerminal ? 'Remove' : 'Cancel'}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function DownloadsPanel(): React.JSX.Element | null {
    return <JobsPanel kind="download" title="Downloads" />;
}

export function InstallsPanel(): React.JSX.Element | null {
    return <JobsPanel kind="install" title="Installs" />;
}
