import { ipcMain } from 'electron';
import { listCfgFiles, setConfigValue, deleteConfigFile } from '../services/ConfigService';
import { runtimeState } from '../store';
import type { ConfigFileDto, Result } from '../../shared/types';
function requireEnv(): {
    ok: true;
    value: string;
} | {
    ok: false;
    error: string;
} {
    if (!runtimeState.environment) {
        return { ok: false, error: 'Game directory not configured' };
    }
    return { ok: true, value: runtimeState.environment.rootPath };
}
export function registerConfigsIpc(): void {
    ipcMain.handle('configs:list', async (): Promise<Result<ConfigFileDto[]>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        return { ok: true, value: listCfgFiles(env.value) };
    });
    ipcMain.handle('configs:set', async (_e, arg: {
        cfgPath: string;
        section: string;
        key: string;
        value: string;
    }): Promise<Result> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        if (!arg || typeof arg.cfgPath !== 'string' || !arg.cfgPath) {
            return { ok: false, error: 'Invalid cfg path' };
        }
        const ok = setConfigValue(arg.cfgPath, arg.section, arg.key, String(arg.value ?? ''));
        return ok ? { ok: true } : { ok: false, error: 'Failed to update config file' };
    });
    ipcMain.handle('configs:delete', async (_e, arg: {
        cfgPath: string;
    }): Promise<Result> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        if (!arg || typeof arg.cfgPath !== 'string' || !arg.cfgPath) {
            return { ok: false, error: 'Invalid cfg path' };
        }
        const ok = deleteConfigFile(env.value, arg.cfgPath);
        return ok ? { ok: true } : { ok: false, error: 'Failed to delete config file' };
    });
}
