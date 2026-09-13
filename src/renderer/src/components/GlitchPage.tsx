import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { de } from '@/i18n/locales/de';
import { ja } from '@/i18n/locales/ja';
import { ko } from '@/i18n/locales/ko';
import { ru } from '@/i18n/locales/ru';
const MARKER = '.glitch-713697';
const BUG_COUNT: [
    number,
    number
] = [1, 3];
const TOAST_CHANCE = 0.4;
const TOAST_DELAY_MS = 1200;
const FOREIGN_LOCALES: Array<Record<string, string>> = [
    de as unknown as Record<string, string>,
    ja as unknown as Record<string, string>,
    ko as unknown as Record<string, string>,
    ru as unknown as Record<string, string>
];
const BUG_TOASTS = [
    'texture_atlas_corrupted (0x8007139F)',
    'Failed to load resource: net::ERR_UNDEFINED',
    "[i18n] missing key: 'detail.desc' — fallback: 何でもいい",
    'GL_INVALID_OPERATION while rendering sprites ┌∩┐(▀̿Ĺ̯▀̿ ̿)┌∩┐',
    'settings may go off the screen — это intentional btw'
];
const randInt = (lo: number, hi: number): number => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(arr: T[]): T | null => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};
const zalgo = (s: string): string => {
    let out = '';
    for (const ch of s) {
        out += ch;
        if (Math.random() < 0.4) {
            const n = randInt(1, 3);
            for (let i = 0; i < n; i++)
                out += String.fromCharCode(0x0300 + randInt(0, 0x6f));
        }
    }
    return out;
};
const GARBLE_CHARS = '▓▒░█▄▀▐▌';
const garble = (s: string): string => [...s]
    .map((ch) => ch === ' ' ? ch : Math.random() < 0.55 ? GARBLE_CHARS[randInt(0, GARBLE_CHARS.length - 1)] : ch)
    .join('');
interface Bug {
    el: Element;
    undo: () => void;
}
export function GlitchPage(): React.JSX.Element | null {
    const bootedRef = useRef(false);
    useEffect(() => {
        if (bootedRef.current)
            return;
        bootedRef.current = true;
        let scope: Element | null = null;
        const findScope = (): void => {
            const marker = document.querySelector(MARKER);
            scope = marker ? (marker.closest('main') ?? marker) : null;
        };
        findScope();
        const active = new Set<Bug>();
        let toastTimer = 0;
        let stopped = false;
        let spawnCount = 0;
        const heal = (bug: Bug): void => {
            active.delete(bug);
            if (bug.el.isConnected)
                bug.undo();
            if (bug.el instanceof HTMLElement)
                delete bug.el.dataset.glitch;
        };
        const healAll = (): void => {
            for (const bug of [...active])
                heal(bug);
        };
        const register = (el: Element, apply: () => void, undo: () => void): void => {
            if (!(el instanceof HTMLElement))
                return;
            if (el.dataset.glitch)
                return;
            el.dataset.glitch = '1';
            apply();
            active.add({ el, undo: () => undo() });
        };
        const imgs = (): HTMLImageElement[] => Array.from(scope?.querySelectorAll<HTMLImageElement>('img') ?? []).filter((im) => !im.dataset.glitch && im.src);
        const textEls = (): HTMLElement[] => Array.from(scope?.querySelectorAll<HTMLElement>('p, h1, h2, h3, span, label, summary, li, a, button') ?? []).filter((el) => {
            if (el.dataset.glitch || el.children.length > 0)
                return false;
            const t = (el.textContent ?? '').trim();
            return t.length >= 2 && t.length <= 80;
        });
        const blocks = (): HTMLElement[] => Array.from(scope?.querySelectorAll<HTMLElement>('section, header, ul, details, div') ?? []).filter((el) => {
            if (el.dataset.glitch)
                return false;
            const r = el.getBoundingClientRect();
            return r.height >= 60 && r.height <= 1400 && r.width >= 120;
        });
        type BugType = 'texrgb' | 'texswap' | 'overflow' | 'nocss' | 'lang' | 'zalgo' | 'shift' | 'undef' | 'flicker' | 'upside' | 'mirror' | 'blur' | 'ghost' | 'hue' | 'tiny' | 'objobj' | 'garble';
        const ALL_TYPES: BugType[] = [
            'texrgb',
            'texswap',
            'overflow',
            'nocss',
            'lang',
            'zalgo',
            'shift',
            'undef',
            'flicker',
            'upside',
            'mirror',
            'blur',
            'ghost',
            'hue',
            'tiny',
            'objobj',
            'garble'
        ];
        const spawnBug = (force?: BugType): BugType | 'skip' => {
            if (stopped || !scope)
                return 'skip';
            const type = force ?? (pick(ALL_TYPES) as BugType);
            try {
                switch (type) {
                    case 'texrgb': {
                        const im = pick(imgs());
                        if (!im)
                            return 'skip';
                        register(im, () => im.classList.add('glitch-rgb'), () => im.classList.remove('glitch-rgb'));
                        break;
                    }
                    case 'texswap': {
                        const pool = imgs();
                        if (pool.length < 2)
                            return 'skip';
                        const a = pick(pool)!;
                        const b = pick(pool.filter((x) => x !== a));
                        if (!b)
                            return 'skip';
                        const sa = a.src;
                        const sb = b.src;
                        register(a, () => {
                            a.src = sb;
                            b.src = sa;
                        }, () => {
                            if (a.isConnected)
                                a.src = sa;
                            if (b.isConnected)
                                b.src = sb;
                            if (b instanceof HTMLElement)
                                delete b.dataset.glitch;
                        });
                        b.dataset.glitch = '1';
                        break;
                    }
                    case 'overflow': {
                        const el = pick(textEls());
                        if (!el)
                            return 'skip';
                        const t = el.textContent ?? '';
                        register(el, () => {
                            el.classList.add('glitch-nowrap');
                            el.textContent = t + t;
                        }, () => {
                            el.classList.remove('glitch-nowrap');
                            el.textContent = t;
                        });
                        break;
                    }
                    case 'nocss': {
                        const el = pick(blocks());
                        if (!el)
                            return 'skip';
                        register(el, () => el.classList.add('glitch-nocss'), () => el.classList.remove('glitch-nocss'));
                        break;
                    }
                    case 'lang': {
                        const el = pick(textEls());
                        const locale = pick(FOREIGN_LOCALES);
                        if (!el || !locale)
                            return 'skip';
                        const t = el.textContent ?? '';
                        register(el, () => {
                            el.textContent = pick(Object.values(locale)) ?? t;
                        }, () => {
                            el.textContent = t;
                        });
                        break;
                    }
                    case 'zalgo': {
                        const el = pick(textEls());
                        if (!el)
                            return 'skip';
                        const t = el.textContent ?? '';
                        register(el, () => {
                            el.textContent = zalgo(t);
                        }, () => {
                            el.textContent = t;
                        });
                        break;
                    }
                    case 'shift': {
                        const el = pick([...blocks(), ...Array.from(scope.querySelectorAll<HTMLElement>('h1, h2'))]);
                        if (!el)
                            return 'skip';
                        register(el, () => el.classList.add('glitch-shift'), () => el.classList.remove('glitch-shift'));
                        break;
                    }
                    case 'undef': {
                        const el = pick(textEls());
                        if (!el)
                            return 'skip';
                        const span = document.createElement('span');
                        span.className = 'glitch-undef';
                        span.textContent = 'undefined';
                        register(el, () => el.appendChild(span), () => span.remove());
                        break;
                    }
                    case 'flicker': {
                        const marker = document.querySelector(MARKER);
                        if (!marker)
                            return 'skip';
                        register(marker, () => marker.classList.add('glitch-flicker'), () => marker.classList.remove('glitch-flicker'));
                        break;
                    }
                    case 'upside': {
                        const el = pick(blocks());
                        if (!el)
                            return 'skip';
                        register(el, () => el.classList.add('glitch-upside'), () => el.classList.remove('glitch-upside'));
                        break;
                    }
                    case 'mirror': {
                        const el = pick(blocks());
                        if (!el)
                            return 'skip';
                        register(el, () => el.classList.add('glitch-mirror'), () => el.classList.remove('glitch-mirror'));
                        break;
                    }
                    case 'blur': {
                        const el = pick([...imgs(), ...blocks()]);
                        if (!el)
                            return 'skip';
                        register(el, () => el.classList.add('glitch-blur'), () => el.classList.remove('glitch-blur'));
                        break;
                    }
                    case 'ghost': {
                        const el = pick(blocks());
                        if (!el)
                            return 'skip';
                        register(el, () => el.classList.add('glitch-ghost'), () => el.classList.remove('glitch-ghost'));
                        break;
                    }
                    case 'hue': {
                        const im = pick(imgs());
                        if (!im)
                            return 'skip';
                        register(im, () => im.classList.add('glitch-hue'), () => im.classList.remove('glitch-hue'));
                        break;
                    }
                    case 'tiny': {
                        const el = pick(textEls());
                        if (!el)
                            return 'skip';
                        register(el, () => el.classList.add('glitch-tiny'), () => el.classList.remove('glitch-tiny'));
                        break;
                    }
                    case 'objobj': {
                        const el = pick(textEls());
                        if (!el)
                            return 'skip';
                        const t = el.textContent ?? '';
                        register(el, () => {
                            el.textContent = '[object Object]';
                        }, () => {
                            el.textContent = t;
                        });
                        break;
                    }
                    case 'garble': {
                        const el = pick(textEls());
                        if (!el)
                            return 'skip';
                        const t = el.textContent ?? '';
                        register(el, () => {
                            el.textContent = garble(t);
                        }, () => {
                            el.textContent = t;
                        });
                        break;
                    }
                }
            }
            catch {
                return 'skip';
            }
            spawnCount += 1;
            return type;
        };
        const applyInitial = (): number => {
            const want = randInt(...BUG_COUNT);
            let applied = 0;
            for (const t of shuffle(ALL_TYPES)) {
                if (applied >= want)
                    break;
                if (spawnBug(t) !== 'skip')
                    applied += 1;
            }
            return applied;
        };
        applyInitial();
        if (Math.random() < TOAST_CHANCE) {
            toastTimer = window.setTimeout(() => {
                if (!stopped)
                    toast.error(pick(BUG_TOASTS) ?? BUG_TOASTS[0], { duration: 4000 });
            }, TOAST_DELAY_MS);
        }
        ;
        (window as unknown as Record<string, unknown>).__glitchPage = {
            force: (t?: BugType) => spawnBug(t),
            healAll,
            reroll: () => {
                healAll();
                return applyInitial();
            },
            stop: () => {
                stopped = true;
                window.clearTimeout(toastTimer);
            },
            spawnCount: () => spawnCount,
            appliedTypes: () => active.size,
            appliedEls: () => [...active].map((b) => b.el)
        };
        return () => {
            stopped = true;
            window.clearTimeout(toastTimer);
            healAll();
            delete (window as unknown as Record<string, unknown>).__glitchPage;
            bootedRef.current = false;
        };
    }, []);
    if (typeof document === 'undefined')
        return null;
    return null;
}
