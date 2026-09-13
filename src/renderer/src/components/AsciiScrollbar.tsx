import { useEffect, useState } from 'react';
const ROW_HEIGHT = 18;
const COLUMN_WIDTH = 22;
const MIN_ROWS = 5;
interface Metrics {
    left: number;
    top: number;
    height: number;
    ratio: number;
}
interface Props {
    selector?: string;
}
export function AsciiScrollbar({ selector = 'main.flex-1.overflow-y-auto' }: Props): React.JSX.Element | null {
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [rows, setRows] = useState(0);
    useEffect(() => {
        const el = document.querySelector<HTMLElement>(selector);
        if (!el)
            return;
        el.classList.add('ascii-scrollbar-hide');
        let frame = 0;
        const measure = (): void => {
            frame = 0;
            const rect = el.getBoundingClientRect();
            const span = el.scrollHeight - el.clientHeight;
            const ratio = span <= 0 ? 0 : Math.min(1, Math.max(0, el.scrollTop / span));
            const usable = Math.max(0, rect.height - 24);
            setRows(Math.max(MIN_ROWS, Math.floor(usable / ROW_HEIGHT)));
            setMetrics({
                left: rect.right - COLUMN_WIDTH,
                top: rect.top,
                height: rect.height,
                ratio
            });
        };
        const schedule = (): void => {
            if (frame)
                return;
            frame = requestAnimationFrame(measure);
        };
        measure();
        el.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        const ro = new ResizeObserver(schedule);
        ro.observe(el);
        return () => {
            if (frame)
                cancelAnimationFrame(frame);
            el.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            ro.disconnect();
            el.classList.remove('ascii-scrollbar-hide');
        };
    }, [selector]);
    if (!metrics || rows < MIN_ROWS)
        return null;
    const track = rows - 2;
    const thumb = 1 + Math.min(track - 1, Math.max(0, Math.round(metrics.ratio * (track - 1))));
    const cells: React.JSX.Element[] = [];
    for (let i = 0; i < rows; i++) {
        const cap = i === 0 || i === rows - 1;
        const isThumb = i === thumb;
        cells.push(<div key={i} className={isThumb
                ? 'ascii-scrollbar-thumb'
                : cap
                    ? 'ascii-scrollbar-cap'
                    : 'ascii-scrollbar-track'} style={{ width: COLUMN_WIDTH, height: ROW_HEIGHT }}>
        {cap ? '——' : isThumb ? '0' : '|'}
      </div>);
    }
    const offset = Math.max(0, (metrics.height - rows * ROW_HEIGHT) / 2);
    return (<div aria-hidden="true" className="ascii-scrollbar pointer-events-none fixed z-30 select-none text-center" style={{ left: metrics.left, top: metrics.top + offset }}>
      {cells}
    </div>);
}
