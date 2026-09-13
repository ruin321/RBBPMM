import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import cursorPng from '@/assets/cursor-710488.png';
const SNAP_RADIUS = 96;
const EASE_RATE = 12;
const HOTSPOT = { x: 23, y: 16 };
const TARGET_SELECTOR = 'button, a[href], [role="button"], summary';
export function MagneticCursor(): React.JSX.Element {
    const imgRef = useRef<HTMLImageElement | null>(null);
    useEffect(() => {
        const img = imgRef.current;
        if (!img)
            return;
        let scope: Element | null = null;
        const findScope = (): void => {
            const marker = document.querySelector('.magnet-715561');
            scope = marker ? (marker.closest('main') ?? marker) : null;
        };
        findScope();
        const mouse = { x: 0, y: 0, has: false };
        const pos = { x: 0, y: 0 };
        let placed = false;
        let visible = false;
        let snapped: HTMLElement | null = null;
        let inWindow = false;
        let raf = 0;
        let prev = performance.now();
        let pressTimer = 0;
        const setHighlight = (el: HTMLElement | null): void => {
            if (snapped === el)
                return;
            snapped?.classList.remove('magnet-target');
            el?.classList.add('magnet-target');
            snapped = el;
        };
        const press = (): void => {
            img.classList.add('magnet-press');
            window.clearTimeout(pressTimer);
            pressTimer = window.setTimeout(() => img.classList.remove('magnet-press'), 110);
        };
        const nearestTarget = (mx: number, my: number) => {
            if (!scope)
                return null;
            let best: HTMLElement | null = null;
            let bestDist = SNAP_RADIUS;
            let bcx = 0;
            let bcy = 0;
            for (const el of scope.querySelectorAll<HTMLElement>(TARGET_SELECTOR)) {
                if (el.closest('[disabled], [aria-disabled="true"]'))
                    continue;
                const r = el.getBoundingClientRect();
                if (r.width < 2 || r.height < 2)
                    continue;
                const px = Math.min(Math.max(mx, r.left), r.right);
                const py = Math.min(Math.max(my, r.top), r.bottom);
                const d = Math.hypot(mx - px, my - py);
                if (d < bestDist) {
                    bestDist = d;
                    best = el;
                    bcx = r.left + r.width / 2;
                    bcy = r.top + r.height / 2;
                }
            }
            return best ? { el: best, cx: bcx, cy: bcy } : null;
        };
        const tick = (now: number): void => {
            raf = requestAnimationFrame(tick);
            const dt = Math.min((now - prev) / 1000, 0.05);
            prev = now;
            if (!scope || !scope.isConnected)
                findScope();
            let inScope = false;
            if (mouse.has && scope) {
                const r = scope.getBoundingClientRect();
                inScope = mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom;
            }
            visible = inScope && inWindow;
            let tx = mouse.x;
            let ty = mouse.y;
            if (visible) {
                const hit = nearestTarget(mouse.x, mouse.y);
                if (hit) {
                    tx = hit.cx;
                    ty = hit.cy;
                    setHighlight(hit.el);
                }
                else {
                    setHighlight(null);
                }
                if (!placed) {
                    placed = true;
                    pos.x = mouse.x;
                    pos.y = mouse.y;
                }
                const k = 1 - Math.exp(-dt * EASE_RATE);
                pos.x += (tx - pos.x) * k;
                pos.y += (ty - pos.y) * k;
            }
            else {
                setHighlight(null);
            }
            img.style.opacity = visible ? '1' : '0';
            img.style.transform = `translate3d(${(pos.x - HOTSPOT.x).toFixed(2)}px, ${(pos.y - HOTSPOT.y).toFixed(2)}px, 0)`;
        };
        const onMove = (e: MouseEvent): void => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            mouse.has = true;
            inWindow = true;
        };
        const onLeave = (): void => {
            inWindow = false;
        };
        const hijackTarget = (e: MouseEvent): HTMLElement | null => {
            if (!e.isTrusted || !visible || !snapped)
                return null;
            const r = snapped.getBoundingClientRect();
            const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            return over ? null : snapped;
        };
        const onMouseDown = (e: MouseEvent): void => {
            if (!visible)
                return;
            press();
            if (hijackTarget(e)) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        const onClick = (e: MouseEvent): void => {
            const target = hijackTarget(e);
            if (target) {
                e.preventDefault();
                e.stopPropagation();
                target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            }
        };
        window.addEventListener('mousemove', onMove, { passive: true });
        document.documentElement.addEventListener('mouseleave', onLeave);
        window.addEventListener('mousedown', onMouseDown, { capture: true });
        window.addEventListener('click', onClick, { capture: true });
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            window.clearTimeout(pressTimer);
            window.removeEventListener('mousemove', onMove);
            document.documentElement.removeEventListener('mouseleave', onLeave);
            window.removeEventListener('mousedown', onMouseDown, { capture: true });
            window.removeEventListener('click', onClick, { capture: true });
            setHighlight(null);
        };
    }, []);
    return createPortal(<img ref={imgRef} src={cursorPng} alt="" aria-hidden="true" draggable={false} className="magnet-fake-cursor select-none" width={64} height={64}/>, document.body);
}
