import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n';
const MARKER = '.flee-714303';
const PUSH_RADIUS = 150;
const TOUCH_RADIUS = 28;
const PUSH_ACC = 2600;
const KICK = 520;
const FRICTION = 3.2;
const RESTITUTION = 0.55;
const HIT_UNLOCK_SPEED = 80;
const EDGE_PAD = 4;
const MAX_BODIES = 120;
const MIN_W = 12;
const MIN_H = 8;
const BIG_AREA_RATIO = 0.5;
function distToRect(px: number, py: number, l: number, t: number, r: number, b: number): number {
    const dx = Math.max(l - px, 0, px - r);
    const dy = Math.max(t - py, 0, py - b);
    return Math.hypot(dx, dy);
}
interface Body {
    el: HTMLElement;
    leftC: number;
    topC: number;
    w: number;
    h: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
}
export function RunawayButtons(): React.JSX.Element | null {
    const fieldRef = useRef<HTMLDivElement | null>(null);
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const [armedUI, setArmedUI] = useState(false);
    const { t } = useI18n();
    useEffect(() => {
        const field = fieldRef.current;
        const btn = btnRef.current;
        const marker = document.querySelector(MARKER);
        if (!field || !btn || !marker)
            return;
        const scope = marker.closest('main');
        if (!scope)
            return;
        const scroller = document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto');
        if (!scroller)
            return;
        let armed = false;
        let stopped = false;
        const bodies = new Map<HTMLElement, Body>();
        let candidates: HTMLElement[] = [];
        const cursor = { x: 0, y: 0, has: false };
        const onMove = (e: MouseEvent): void => {
            cursor.x = e.clientX;
            cursor.y = e.clientY;
            cursor.has = true;
        };
        window.addEventListener('mousemove', onMove, { passive: true });
        const unlock = (el: HTMLElement, vx: number, vy: number): Body => {
            const r = el.getBoundingClientRect();
            const s = scope.getBoundingClientRect();
            const body: Body = {
                el,
                leftC: r.left - (s.left - scope.scrollLeft),
                topC: r.top - (s.top - scope.scrollTop),
                w: r.width,
                h: r.height,
                x: 0,
                y: 0,
                vx,
                vy
            };
            el.dataset.flee = '1';
            el.style.willChange = 'transform';
            bodies.set(el, body);
            const log = unlockLog as {
                id: string;
                cx: number;
                cy: number;
                px: number;
                py: number;
                t: number;
            }[];
            log.push({
                id: el.id || el.textContent?.trim().slice(0, 10) || '?',
                cx: Math.round(r.left + r.width / 2),
                cy: Math.round(r.top + r.height / 2),
                px: Math.round(cursor.x),
                py: Math.round(cursor.y),
                t: Math.round(performance.now())
            });
            if (log.length > 30)
                log.shift();
            return body;
        };
        const unlockLog: unknown[] = [];
        const hasAncestorBody = (el: HTMLElement): boolean => {
            for (let p = el.parentElement; p; p = p.parentElement) {
                if (bodies.has(p))
                    return true;
            }
            return false;
        };
        const collectCandidates = (): void => {
            const bigArea = scope.clientWidth * scope.clientHeight * BIG_AREA_RATIO;
            const out: HTMLElement[] = [];
            for (const el of scope.querySelectorAll<HTMLElement>('*')) {
                if (out.length >= MAX_BODIES * 2)
                    break;
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE')
                    continue;
                const r = el.getBoundingClientRect();
                if (r.width < MIN_W || r.height < MIN_H)
                    continue;
                if (r.width * r.height > bigArea)
                    continue;
                out.push(el);
            }
            candidates = out;
        };
        const isInsideLoose = (el: HTMLElement): boolean => {
            for (const b of bodies.values()) {
                if (b.el !== el && b.el.contains(el))
                    return true;
            }
            return false;
        };
        const setArmed = (on: boolean): void => {
            if (on === armed)
                return;
            armed = on;
            setArmedUI(on);
            if (on) {
                collectCandidates();
            }
            else {
                for (const b of bodies.values()) {
                    b.el.style.transform = '';
                    b.el.style.willChange = '';
                    delete b.el.dataset.flee;
                }
                bodies.clear();
            }
        };
        btn.addEventListener('click', () => setArmed(!armed));
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
        let rafField = 0;
        const fieldTick = (): void => {
            rafField = requestAnimationFrame(fieldTick);
            syncField();
        };
        rafField = requestAnimationFrame(fieldTick);
        let last = performance.now();
        let raf = 0;
        const dbg = { statics: [] as string[], error: '' };
        const tick = (now: number): void => {
            raf = requestAnimationFrame(tick);
            if (stopped)
                return;
            try {
                tickBody(now);
            }
            catch (e) {
                dbg.error = e instanceof Error ? e.message : String(e);
            }
        };
        const tickBody = (now: number): void => {
            if (stopped)
                return;
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            if (!armed || !cursor.has)
                return;
            const scopeRect = scope.getBoundingClientRect();
            const cl = scopeRect.left - scope.scrollLeft;
            const ct = scopeRect.top - scope.scrollTop;
            const centerOf = (b: Body): {
                cx: number;
                cy: number;
                r: number;
            } => ({
                cx: b.leftC + cl + b.w / 2 + b.x,
                cy: b.topC + ct + b.h / 2 + b.y,
                r: (b.w + b.h) / 4
            });
            if (bodies.size < MAX_BODIES) {
                for (const el of candidates) {
                    if (bodies.size >= MAX_BODIES)
                        break;
                    if (bodies.has(el) || isInsideLoose(el))
                        continue;
                    const r = el.getBoundingClientRect();
                    if (r.width < MIN_W || r.height < MIN_H)
                        continue;
                    if (distToRect(cursor.x, cursor.y, r.left, r.top, r.right, r.bottom) <= TOUCH_RADIUS) {
                        const cx = r.left + r.width / 2;
                        const cy = r.top + r.height / 2;
                        let dx = cx - cursor.x;
                        let dy = cy - cursor.y;
                        const d = Math.hypot(dx, dy);
                        if (d < 1) {
                            dx = 0;
                            dy = 1;
                        }
                        else {
                            dx /= d;
                            dy /= d;
                        }
                        unlock(el, dx * KICK, dy * KICK);
                    }
                }
            }
            for (const b of bodies.values()) {
                const c = centerOf(b);
                const dx = c.cx - cursor.x;
                const dy = c.cy - cursor.y;
                const d = Math.hypot(dx, dy);
                if (d >= PUSH_RADIUS)
                    continue;
                const ux = d < 0.5 ? 0 : dx / d;
                const uy = d < 0.5 ? 1 : dy / d;
                const a = (1 - d / PUSH_RADIUS) * PUSH_ACC;
                b.vx += ux * a * dt;
                b.vy += uy * a * dt;
            }
            const damp = Math.exp(-FRICTION * dt);
            for (const b of bodies.values()) {
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.vx *= damp;
                b.vy *= damp;
            }
            const pending: Array<{
                el: HTMLElement;
                vx: number;
                vy: number;
            }> = [];
            const all = [...bodies.values()];
            const statics: HTMLElement[] = [];
            if (bodies.size < MAX_BODIES) {
                for (const el of candidates) {
                    if (!bodies.has(el) && !isInsideLoose(el))
                        statics.push(el);
                }
            }
            dbg.statics = statics.map((el) => el.id || el.tagName).slice(0, 20);
            for (let i = 0; i < all.length; i++) {
                const a = all[i];
                const ca = centerOf(a);
                for (const el of statics) {
                    const r = el.getBoundingClientRect();
                    if (r.width < MIN_W || r.height < MIN_H)
                        continue;
                    const cb = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: (r.width + r.height) / 4 };
                    const dx = cb.cx - ca.cx;
                    const dy = cb.cy - ca.cy;
                    const d = Math.hypot(dx, dy);
                    const minD = ca.r + cb.r;
                    if (d >= minD)
                        continue;
                    const ux = d < 0.5 ? 0 : dx / d;
                    const uy = d < 0.5 ? -1 : dy / d;
                    const overlap = minD - d;
                    a.x -= ux * overlap;
                    a.y -= uy * overlap;
                    const vn = a.vx * ux + a.vy * uy;
                    if (vn > 0) {
                        a.vx -= (1 + RESTITUTION) * vn * ux;
                        a.vy -= (1 + RESTITUTION) * vn * uy;
                        if (vn > HIT_UNLOCK_SPEED) {
                            pending.push({ el, vx: ux * vn * 0.7, vy: uy * vn * 0.7 });
                        }
                    }
                }
                for (let j = i + 1; j < all.length; j++) {
                    const b = all[j];
                    const cb = centerOf(b);
                    const dx = cb.cx - ca.cx;
                    const dy = cb.cy - ca.cy;
                    const d = Math.hypot(dx, dy);
                    const minD = ca.r + cb.r;
                    if (d >= minD || d < 0.001)
                        continue;
                    const ux = dx / d;
                    const uy = dy / d;
                    const overlap = minD - d;
                    const ma = Math.max(a.w * a.h, 1);
                    const mb = Math.max(b.w * b.h, 1);
                    const sa = (mb / (ma + mb)) * overlap;
                    const sb = (ma / (ma + mb)) * overlap;
                    a.x -= ux * sa;
                    a.y -= uy * sa;
                    b.x += ux * sb;
                    b.y += uy * sb;
                    const vn = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
                    if (vn < 0) {
                        const jj = (-(1 + RESTITUTION) * vn) / (1 / ma + 1 / mb);
                        a.vx -= (jj / ma) * ux;
                        a.vy -= (jj / ma) * uy;
                        b.vx += (jj / mb) * ux;
                        b.vy += (jj / mb) * uy;
                    }
                }
            }
            for (const p of pending) {
                if (!bodies.has(p.el) && !isInsideLoose(p.el) && bodies.size < MAX_BODIES) {
                    unlock(p.el, p.vx, p.vy);
                }
            }
            const cw = scope.scrollWidth;
            const ch = scope.scrollHeight;
            for (const b of bodies.values()) {
                const minX = EDGE_PAD - b.leftC;
                const maxX = cw - EDGE_PAD - b.leftC - b.w;
                const minY = EDGE_PAD - b.topC;
                const maxY = ch - EDGE_PAD - b.topC - b.h;
                if (b.x < minX) {
                    b.x = minX;
                    if (b.vx < 0)
                        b.vx = -b.vx * RESTITUTION;
                }
                else if (b.x > maxX) {
                    b.x = maxX;
                    if (b.vx > 0)
                        b.vx = -b.vx * RESTITUTION;
                }
                if (b.y < minY) {
                    b.y = minY;
                    if (b.vy < 0)
                        b.vy = -b.vy * RESTITUTION;
                }
                else if (b.y > maxY) {
                    b.y = maxY;
                    if (b.vy > 0)
                        b.vy = -b.vy * RESTITUTION;
                }
            }
            for (const b of bodies.values()) {
                b.el.style.transform = `translate(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px)`;
            }
        };
        raf = requestAnimationFrame(tick);
        (window as unknown as Record<string, unknown>).__flee = {
            trigger: () => btn.click(),
            reset: () => setArmed(false),
            isArmed: () => armed,
            unlockId: (id: string, vx: number, vy: number): boolean => {
                const el = candidates.find((c) => c.id === id);
                if (!el || bodies.has(el))
                    return false;
                unlock(el, vx, vy);
                return true;
            },
            tp: (id: string, x: number, y: number): boolean => {
                const b = [...bodies.values()].find((bb) => bb.el.id === id);
                if (!b)
                    return false;
                b.x = x;
                b.y = y;
                return true;
            },
            bodyRect: (id: string): {
                leftC: number;
                topC: number;
                w: number;
                h: number;
                x: number;
                y: number;
            } | null => {
                const b = [...bodies.values()].find((bb) => bb.el.id === id);
                return b ? { leftC: b.leftC, topC: b.topC, w: b.w, h: b.h, x: b.x, y: b.y } : null;
            },
            unlockLog: () => unlockLog,
            candidateIds: () => candidates.map((c) => c.id || c.tagName),
            dbg: () => dbg,
            looseCount: () => bodies.size,
            candidateCount: () => candidates.length,
            looseIds: () => [...bodies.keys()].map((el) => el.id || el.textContent?.trim() || '?'),
            offsets: () => [...bodies.values()].map((b) => ({
                id: b.el.id,
                x: b.x,
                y: b.y,
                vx: b.vx,
                vy: b.vy
            }))
        };
        return () => {
            stopped = true;
            cancelAnimationFrame(raf);
            cancelAnimationFrame(rafField);
            ro.disconnect();
            window.removeEventListener('resize', syncField);
            window.removeEventListener('mousemove', onMove);
            for (const b of bodies.values()) {
                b.el.style.transform = '';
                b.el.style.willChange = '';
                delete b.el.dataset.flee;
            }
            bodies.clear();
            delete (window as unknown as Record<string, unknown>).__flee;
        };
    }, []);
    if (typeof document === 'undefined')
        return null;
    return createPortal(<div ref={fieldRef} aria-hidden="true" className="pointer-events-none fixed z-30 overflow-hidden" style={{ left: 0, top: 0, width: 0, height: 0 }}>
      <button ref={btnRef} type="button" style={{ position: 'absolute', right: 20, bottom: 20, pointerEvents: 'auto' }}>
        {armedUI ? t('egg.flee.armed') : t('egg.flee.arm')}
      </button>
    </div>, document.body);
}
