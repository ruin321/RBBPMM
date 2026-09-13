import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import baldiPng from '@/assets/baldi.png';
const SPRITE_H = 200;
const SPRITE_W = Math.round((SPRITE_H * 67) / 147);
const MOVE_SPEED = 300;
const GRACE_MS = 1600;
const EDGE_PAD = 16;
const HIT_INSET = 4;
const SNAP_MS = 180;
function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi);
}
export function BaldiChase(): React.JSX.Element | null {
    const fieldRef = useRef<HTMLDivElement | null>(null);
    const spriteRef = useRef<HTMLImageElement | null>(null);
    useEffect(() => {
        const field = fieldRef.current;
        const sprite = spriteRef.current;
        if (!field || !sprite)
            return;
        const scroller = document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto');
        if (!scroller)
            return;
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
        const pos = { x: fieldRect.w - SPRITE_W - EDGE_PAD, y: 6 };
        let lastScroll = scroller.scrollTop;
        let facing = 1;
        let caught = false;
        let hasMouse = false;
        let placed = false;
        const mouse = { x: 0, y: 0 };
        const startedAt = performance.now();
        let prev = startedAt;
        let raf = 0;
        const ro = new ResizeObserver(syncField);
        ro.observe(scroller);
        window.addEventListener('resize', syncField);
        const onMove = (e: MouseEvent): void => {
            mouse.x = e.clientX - fieldRect.left;
            mouse.y = e.clientY - fieldRect.top;
            hasMouse = true;
        };
        window.addEventListener('mousemove', onMove, { passive: true });
        const tick = (now: number): void => {
            raf = requestAnimationFrame(tick);
            if (caught)
                return;
            const dt = Math.min((now - prev) / 1000, 0.05);
            prev = now;
            syncField();
            const W = fieldRect.w;
            const H = fieldRect.h;
            const st = scroller.scrollTop;
            pos.y -= st - lastScroll;
            lastScroll = st;
            const seen = pos.x < W && pos.x + SPRITE_W > 0 && pos.y < H && pos.y + SPRITE_H > 0;
            if (!seen && hasMouse) {
                const tx = clamp(mouse.x - SPRITE_W / 2, EDGE_PAD, Math.max(EDGE_PAD, W - SPRITE_W - EDGE_PAD));
                const ty = clamp(mouse.y - SPRITE_H / 2, EDGE_PAD, Math.max(EDGE_PAD, H - SPRITE_H - EDGE_PAD));
                const dx = tx - pos.x;
                const dy = ty - pos.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 1) {
                    const step = Math.min(dist, MOVE_SPEED * dt);
                    pos.x += (dx / dist) * step;
                    pos.y += (dy / dist) * step;
                    facing = dx < 0 ? -1 : 1;
                }
            }
            if (!placed) {
                placed = true;
                sprite.style.opacity = '1';
            }
            if (seen &&
                !caught &&
                hasMouse &&
                now - startedAt > GRACE_MS &&
                mouse.x > pos.x + HIT_INSET &&
                mouse.x < pos.x + SPRITE_W - HIT_INSET &&
                mouse.y > pos.y + HIT_INSET &&
                mouse.y < pos.y + SPRITE_H - HIT_INSET) {
                caught = true;
                sprite.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scale(2.6)`;
                window.setTimeout(() => {
                    void window.api.window.close();
                }, SNAP_MS);
                return;
            }
            sprite.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scaleX(${facing})`;
        };
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            window.removeEventListener('resize', syncField);
            window.removeEventListener('mousemove', onMove);
        };
    }, []);
    if (typeof document === 'undefined')
        return null;
    return createPortal(<div ref={fieldRef} aria-hidden="true" className="pointer-events-none fixed z-30 overflow-hidden" style={{ left: 0, top: 0, width: 0, height: 0 }}>
      <img ref={spriteRef} src={baldiPng} alt="" draggable={false} className="absolute left-0 top-0 select-none opacity-0" style={{ width: SPRITE_W, height: SPRITE_H, willChange: 'transform' }}/>
    </div>, document.body);
}
