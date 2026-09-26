import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { App } from '@renderer/App';
import { I18nProvider } from '@renderer/i18n';

const w = window as unknown as Record<string, any>;

const BARE: Record<string, unknown> = {
    'app.getLocale': 'zh-CN',
    'app.getNavOpen': true,
    'app.getSplash': false,
    'app.getFont': 'Comic Sans MS',
    'app.getDebugLogging': false,
    'app.listFonts': ['Comic Sans MS', 'Segoe UI', 'Tahoma'],
    'app.resetSettings': null
};

const RESULT: Record<string, unknown> = {
    'game.get': null,
    'game.isRunning': { running: false },
    'mods.list': [],
    'textures.list': [],
    'customLevel.list': [],
    'configs.list': [],
    'setup.status': { hasBepInEx: false },
    'toolbox.dirs': { dirs: [] }
};

w.__theme = w.__FORCE_THEME ?? new URLSearchParams(location.search).get('theme') ?? 'windows';

const cache = new Map<string, unknown>();
const nsCache = new Map<string, unknown>();
w.api = new Proxy({}, {
    get(_t, ns) {
        if (typeof ns !== 'string') return undefined;
        if (!nsCache.has(ns)) {
            nsCache.set(ns, new Proxy({}, {
                get(_t2, key) {
                    if (typeof key !== 'string') return undefined;
                    const id = ns + '.' + key;
                    if (!cache.has(id)) {
                        cache.set(id, (..._a: unknown[]) => {
                            if (/^on[A-Z]/.test(key)) return () => {};
                            if (key === 'getTheme') return Promise.resolve(w.__theme);
                            if (id in BARE) return Promise.resolve(BARE[id]);
                            if (ns === 'app') return Promise.resolve(null);
                            return Promise.resolve({ ok: true, value: RESULT[id] ?? null });
                        });
                    }
                    return cache.get(id);
                }
            }));
        }
        return nsCache.get(ns);
    }
});

const fail = (text: string): void => {
    const el = document.getElementById('boot-error');
    if (el) el.textContent = (el.textContent ? el.textContent + ' || ' : '') + text;
};
w.onerror = (msg: unknown, _src: unknown, line: unknown, col: unknown, err: any) => {
    fail(String(err?.stack ?? msg) + ' @' + line + ':' + col);
};
w.addEventListener('unhandledrejection', (e: any) => {
    fail('unhandledrejection: ' + String(e?.reason?.stack ?? e?.reason));
});

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
try {
    flushSync(() => {
        root.render(
            <React.StrictMode>
                <I18nProvider>
                    <App />
                </I18nProvider>
            </React.StrictMode>
        );
    });
    fail('render returned, children=' + document.getElementById('root')!.childElementCount);
}
catch (e: any) {
    fail('render threw: ' + String(e?.stack ?? e));
}

setTimeout(() => {
    const r = document.getElementById('root');
    fail('later, children=' + (r ? r.childElementCount : -1));
}, 400);
