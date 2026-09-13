import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import scareGif from '@/assets/scare-703263.gif';
const MARKER = '.scare-703263';
const BTN_W = 110;
const EDGE_PAD = 20;
const SCARE_MS = 900;
const CLOSE_MS = 1300;
export function JumpScare(): React.JSX.Element | null {
    const fieldRef = useRef<HTMLDivElement | null>(null);
    const btnRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        const field = fieldRef.current;
        const btn = btnRef.current;
        const marker = document.querySelector<HTMLElement>(MARKER);
        if (!field || !btn || !marker)
            return;
        const scroller = document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto');
        if (!scroller)
            return;
        let fired = false;
        let closeTimer = 0;
        const fieldRect = { left: 0, top: 0, w: 0, h: 0 };
        const syncField = (): void => {
            const r = scroller.getBoundingClientRect();
            const left = Math.round(r.left);
            const top = Math.round(r.top);
            const w = Math.round(r.width);
            const h = Math.round(r.height);
            if (left === fieldRect.left && top === fieldRect.top && w === fieldRect.w && h === fieldRect.h) {
                return;
            }
            fieldRect.left = left;
            fieldRect.top = top;
            fieldRect.w = w;
            fieldRect.h = h;
            field.style.left = `${left}px`;
            field.style.top = `${top}px`;
            field.style.width = `${w}px`;
            field.style.height = `${h}px`;
        };
        syncField();
        const ro = new ResizeObserver(syncField);
        ro.observe(scroller);
        window.addEventListener('resize', syncField);
        let raf = 0;
        const tick = (): void => {
            raf = requestAnimationFrame(tick);
            syncField();
        };
        raf = requestAnimationFrame(tick);
        const fire = (): void => {
            if (fired)
                return;
            fired = true;
            const overlay = document.createElement('div');
            overlay.className = 'scare-overlay';
            overlay.style.cssText =
                'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483646;background:#000;overflow:hidden;pointer-events:auto';
            const img = document.createElement('img');
            img.src = scareGif;
            img.alt = '';
            img.draggable = false;
            img.style.cssText = [
                'position:absolute',
                'left:50%',
                'top:50%',
                'width:100vmax',
                'height:auto',
                'transform:translate(-50%,-50%) scale(0.06)',
                'transform-origin:center',
                `transition:transform ${SCARE_MS}ms cubic-bezier(0.55,0,1,0.45)`,
                'will-change:transform'
            ].join(';');
            overlay.appendChild(img);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    img.style.transform = 'translate(-50%,-50%) scale(1)';
                });
            });
            closeTimer = window.setTimeout(() => {
                void window.api.window.close();
            }, CLOSE_MS);
            (window as unknown as Record<string, unknown>).__scareOverlay = overlay;
        };
        btn.addEventListener('click', fire);
        (window as unknown as Record<string, unknown>).__scare = {
            fire,
            isFired: () => fired,
            rect: () => {
                const r = btn.getBoundingClientRect();
                return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
            },
            overlay: () => {
                const o = document.querySelector('.scare-overlay');
                if (!o)
                    return null;
                const img = o.querySelector('img');
                return {
                    bg: getComputedStyle(o).backgroundColor,
                    imgTransform: img ? getComputedStyle(img).transform : null
                };
            }
        };
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            window.removeEventListener('resize', syncField);
            btn.removeEventListener('click', fire);
            if (closeTimer)
                window.clearTimeout(closeTimer);
            document.querySelector('.scare-overlay')?.remove();
            delete (window as unknown as Record<string, unknown>).__scare;
            delete (window as unknown as Record<string, unknown>).__scareOverlay;
        };
    }, []);
    if (typeof document === 'undefined')
        return null;
    return createPortal(<div ref={fieldRef} aria-hidden="true" className="pointer-events-none fixed z-30 overflow-hidden" style={{ left: 0, top: 0, width: 0, height: 0 }}>
      <button ref={btnRef} type="button" aria-label="scare" style={{
            position: 'absolute',
            left: EDGE_PAD,
            bottom: EDGE_PAD,
            width: BTN_W,
            pointerEvents: 'auto',
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer'
        }}>
        <img src={scareGif} alt="" draggable={false} style={{ width: '100%', display: 'block' }}/>
      </button>
    </div>, document.body);
}
