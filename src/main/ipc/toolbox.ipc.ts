import fs from 'fs';
import path from 'path';
import { ipcMain, shell } from 'electron';
import { runtimeState } from '../store';
import { BEPINEX_FOLDER, BEPINEX_CONFIG_FOLDER, PLUGINS_FOLDER } from '../constants';
import type { Result, ToolboxDirDto } from '../../shared/types';
export function registerToolboxIpc(): void {
    ipcMain.handle('toolbox:dirs', async (): Promise<Result<ToolboxDirDto[]>> => {
        const env = runtimeState.environment;
        if (!env)
            return { ok: false, error: 'no game configured' };
        const root = env.rootPath;
        const build = (key: string, dir: string): ToolboxDirDto | null => {
            if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
                return null;
            return { key, path: dir };
        };
        const dirs = [
            build('root', root),
            build('bepinex', path.join(root, BEPINEX_FOLDER)),
            build('plugins', path.join(root, BEPINEX_FOLDER, PLUGINS_FOLDER)),
            build('config', path.join(root, BEPINEX_FOLDER, BEPINEX_CONFIG_FOLDER)),
            build('modded', path.join(env.dataFolder, 'StreamingAssets', 'Modded'))
        ].filter((x): x is ToolboxDirDto => x !== null);
        return { ok: true, value: dirs };
    });
    ipcMain.handle('toolbox:open-dir', async (_e, { path: p }: {
        path: string;
    }): Promise<boolean> => {
        if (!p || !fs.existsSync(p) || !fs.statSync(p).isDirectory())
            return false;
        const r = await shell.openPath(p);
        return r === '';
    });
    ipcMain.handle('toolbox:read-log', async (): Promise<Result<{
        text: string;
    }>> => {
        const env = runtimeState.environment;
        if (!env)
            return { ok: false, error: 'no game configured' };
        const logFile = path.join(env.rootPath, BEPINEX_FOLDER, 'LogOutput.log');
        if (!fs.existsSync(logFile))
            return { ok: true, value: { text: '' } };
        try {
            const text = fs.readFileSync(logFile, 'utf8');
            return { ok: true, value: { text: text.slice(-300000) } };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
}