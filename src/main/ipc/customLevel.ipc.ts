import { ipcMain } from 'electron'
import {
  deleteCustomLevel,
  listCustomLevels,
  toggleCustomLevel
} from '../services/CustomLevelService'
import type { CustomLevelDto, Result } from '../../shared/types'

export function registerCustomLevelIpc(): void {
  ipcMain.handle(
    'customLevel:list',
    async (): Promise<Result<CustomLevelDto[]>> => {
      try {
        return { ok: true, value: listCustomLevels() }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'customLevel:toggle',
    async (_e, { fileName, enabled }: { fileName: string; enabled: boolean }): Promise<Result> => {
      try {
        toggleCustomLevel(fileName, Boolean(enabled))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'customLevel:delete',
    async (_e, { fileName }: { fileName: string }): Promise<Result> => {
      try {
        deleteCustomLevel(fileName)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}