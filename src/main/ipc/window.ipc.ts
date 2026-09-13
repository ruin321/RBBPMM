import { ipcMain, type BrowserWindow } from 'electron';
export function registerWindowIpc(getWindow: () => BrowserWindow | null): void {
    ipcMain.handle('window:minimize', () => getWindow()?.minimize());
    ipcMain.handle('window:toggle-maximize', () => {
        const w = getWindow();
        if (!w)
            return;
        if (w.isMaximized())
            w.unmaximize();
        else
            w.maximize();
    });
    ipcMain.handle('window:close', () => getWindow()?.close());
    ipcMain.handle('window:is-maximized', () => getWindow()?.isMaximized() ?? false);
    ipcMain.handle('window:register-maximize-events', () => {
        const w = getWindow();
        if (!w)
            return;
        w.on('maximize', () => w.webContents.send('window:maximized-changed', true));
        w.on('unmaximize', () => w.webContents.send('window:maximized-changed', false));
    });
    ipcMain.handle('window:prank-size', () => {
        const w = getWindow();
        if (!w)
            return;
        const wasMaximized = w.isMaximized();
        const bounds = w.getNormalBounds();
        if (wasMaximized)
            w.unmaximize();
        w.setBounds({
            x: bounds.x,
            y: bounds.y,
            width: Math.max(420, Math.round(bounds.width * 0.6)),
            height: Math.max(360, Math.round(bounds.height * 0.6))
        });
        setTimeout(() => {
            const now = getWindow();
            if (!now)
                return;
            now.setBounds(bounds);
        }, 1400);
    });
    ipcMain.handle('window:jiggle', () => {
        const w = getWindow();
        if (!w)
            return;
        const base = w.getBounds();
        let i = 0;
        const steps = 10;
        const tick = (): void => {
            i++;
            if (i > steps) {
                const now = getWindow();
                if (now)
                    now.setPosition(base.x, base.y);
                return;
            }
            const now = getWindow();
            if (!now)
                return;
            const dx = Math.round((Math.random() - 0.5) * 70);
            const dy = Math.round((Math.random() - 0.5) * 46);
            now.setPosition(base.x + dx, base.y + dy);
            setTimeout(tick, 65);
        };
        tick();
    });
    ipcMain.handle('window:skew', () => {
        const w = getWindow();
        if (!w)
            return;
        const bounds = w.getNormalBounds();
        let i = 0;
        const steps = 8;
        const tick = (): void => {
            i++;
            const now = getWindow();
            if (!now)
                return;
            if (i > steps) {
                now.setBounds(bounds);
                return;
            }
            const w2 = i % 2 === 0 ? Math.round(bounds.width * 0.78) : Math.round(bounds.width * 1.14);
            const h2 = i % 2 === 0 ? Math.round(bounds.height * 1.12) : Math.round(bounds.height * 0.88);
            now.setBounds({
                x: bounds.x - Math.round((w2 - bounds.width) / 2),
                y: bounds.y - Math.round((h2 - bounds.height) / 2),
                width: Math.max(420, w2),
                height: Math.max(340, h2)
            });
            setTimeout(tick, 120);
        };
        tick();
    });
}
