import { ClipboardList, Eye, FolderOpen, FolderPlus, MoreVertical, Package, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ModItemDto, ModUpdateInfoDto } from '@shared/types'
import { useI18n } from '@/i18n'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { useState } from 'react'

interface Props {
  mod: ModItemDto
  updateInfo?: ModUpdateInfoDto
  updating?: boolean
  onUpdate?: () => void
  onToggle: (guid: string, activate: boolean) => Promise<boolean>
  onUninstall: (guid: string) => Promise<boolean>
  
  onEditConfig?: (configFile?: string, search?: string) => void
}

export function ModListItem({
  mod,
  updateInfo,
  updating,
  onUpdate,
  onToggle,
  onUninstall,
  onEditConfig
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<boolean | null>(null)

  const toggle = async (checked: boolean): Promise<void> => {
    setPending(checked)
    setBusy(true)
    const ok = await onToggle(mod.guid, checked)
    setBusy(false)
    if (!ok) {
      toast.error(checked ? t('list.failEnable') : t('list.failDisable'), { description: mod.name })
      setPending(null)
    }
  }

  const uninstall = async (): Promise<void> => {
    setBusy(true)
    const ok = await onUninstall(mod.guid)
    setBusy(false)
    if (ok) toast.success(t('mods.uninstalled'), { description: mod.name })
    else toast.error(t('mods.failUninstall'), { description: mod.name })
  }

  return (
    <Card className="w-full">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Package className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{mod.name}</span>
            {!mod.supportsCurrentVersion && (
              <Badge variant="warning">{t('mods.notMatch')}</Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{mod.author}</span>
            <Badge variant="secondary">v{mod.version}</Badge>
          </div>
          {updateInfo && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="flex-1 text-foreground">
                {updateInfo.version
                  ? t('mods.updateAvailableV', { version: updateInfo.version })
                  : t('mods.updateAvailable')}
              </span>
              <Button
                size="sm"
                variant="default"
                disabled={updating}
                onClick={onUpdate}
                className="h-7 gap-1 px-2.5"
              >
                <RefreshCw className={updating ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                {updating ? t('banana.installing') : t('mods.update')}
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={pending !== null ? pending : mod.activated}
              disabled={busy}
              onCheckedChange={(c) => void toggle(c)}
            />
          </div>
          <Dialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={busy}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem disabled className="font-mono text-xs">
                  <span className="mr-2 inline-block w-6 text-muted-foreground">{t('list.id')}</span>
                  {mod.identifyName ??
                    (mod.guid.startsWith('legacy:')
                      ? mod.guid.slice('legacy:'.length)
                      : mod.guid)}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {}
                {mod.dllFile && (
                  mod.loose ? (
                    <DropdownMenuItem
                      onClick={() => void window.api.ui.revealFile(mod.dllFile!)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t('list.revealInExplorer')}
                    </DropdownMenuItem>
                  ) : (
                    mod.dllDirectory && (
                      <DropdownMenuItem
                        onClick={() => void window.api.ui.openFolder(mod.dllDirectory!)}
                      >
                        <FolderPlus className="mr-2 h-4 w-4" />
                        {t('list.openDllFolder')}
                      </DropdownMenuItem>
                    )
                  )
                )}
                {onEditConfig && (
                  <DropdownMenuItem
                    onClick={() => {
                      onEditConfig(mod.configFile, mod.name)
                    }}
                  >
                    <ClipboardList className="mr-2 h-4 w-4" />
                    {t('list.editConfig')}
                  </DropdownMenuItem>
                )}
                {mod.moddedFolder && (
                  <>
                    <DropdownMenuItem onClick={() => void window.api.ui.openFolder(mod.moddedFolder!)}>
                      <FolderOpen className="mr-2 h-4 w-4" />
                      {t('list.openModded')}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DialogTrigger asChild>
                  <DropdownMenuItem className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('list.uninstall')}
                  </DropdownMenuItem>
                </DialogTrigger>
              </DropdownMenuContent>
            </DropdownMenu>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('list.uninstallTitle', { name: mod.name })}</DialogTitle>
                <DialogDescription>{t('list.uninstallWarn')}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogTrigger asChild>
                  <Button variant="outline">{t('list.cancel')}</Button>
                </DialogTrigger>
                <Button variant="destructive" onClick={() => void uninstall()}>
                  {t('list.uninstall')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}