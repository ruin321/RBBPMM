import { ipcMain, WebContents } from 'electron';
import { installTracker } from '../services/InstallTracker';
import type { JobProgress } from '../../shared/types';

export function registerInstallIpc(getWebContents: () => WebContents | null): void {
    installTracker.subscribe((p) => {
        getWebContents()?.send('install:job-progress', p);
    });

    ipcMain.handle('install:get-jobs', async (): Promise<JobProgress[]> => installTracker.getAll());
    ipcMain.handle('install:clear-job', async (_e, { jobId }: {
        jobId: string;
    }): Promise<void> => {
        installTracker.remove(jobId);
    });
    ipcMain.handle('install:clear-completed', async (): Promise<void> => {
        installTracker.clearCompleted();
    });
}
