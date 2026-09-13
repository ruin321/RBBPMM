import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import milkPng from '@/assets/milk-708588.png';
import drinkUrl from '@/assets/drink-708588.wav';
import drinkRevUrl from '@/assets/drink-708588-rev.wav';
const MARKER = '.milk-708588';
const BTN_W = 76;
const EDGE_PAD = 20;
export function MilkPage(): React.JSX.Element | null {
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
        let flipped = false;
        let lastAction: 'drink' | 'rev' | null = null;
        const drink = new Audio(drinkUrl);
        const drinkRev = new Audio(drinkRevUrl);
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
        const onClick = (): void => {
            flipped = !flipped;
            if (flipped) {
                marker.classList.add('is-milk-flipped');
                btn.classList.add('milk-flipped');
                lastAction = 'drink';
                drink.currentTime = 0;
                void drink.play().catch(() => { });
            }
            else {
                marker.classList.remove('is-milk-flipped');
                btn.classList.remove('milk-flipped');
                lastAction = 'rev';
                drinkRev.currentTime = 0;
                void drinkRev.play().catch(() => { });
            }
        };
        btn.addEventListener('click', onClick);
        (window as unknown as Record<string, unknown>).__milk = {
            click: () => btn.click(),
            isFlipped: () => flipped,
            playing: () => (!drink.paused ? 'drink' : !drinkRev.paused ? 'rev' : null),
            lastAction: () => lastAction,
            rect: () => {
                const r = btn.getBoundingClientRect();
                return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
            }
        };
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            window.removeEventListener('resize', syncField);
            btn.removeEventListener('click', onClick);
            drink.pause();
            drinkRev.pause();
            marker.classList.remove('is-milk-flipped');
            delete (window as unknown as Record<string, unknown>).__milk;
        };
    }, []);
    if (typeof document === 'undefined')
        return null;
    return createPortal(<div ref={fieldRef} aria-hidden="true" className="pointer-events-none fixed z-30 overflow-hidden" style={{ left: 0, top: 0, width: 0, height: 0 }}>
      <button ref={btnRef} type="button" aria-label="milk" className="milk-btn absolute select-none" style={{ right: EDGE_PAD, bottom: EDGE_PAD, width: BTN_W, pointerEvents: 'auto' }}>
        <img src={milkPng} alt="" draggable={false} className="w-full" style={{ imageRendering: 'pixelated' }}/>
      </button>
    </div>, document.body);
}
