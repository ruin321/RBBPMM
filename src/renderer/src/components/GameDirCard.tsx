import { FolderOpen, FolderSearch, MonitorCog, Wrench } from 'lucide-react'
import type { GameEnvironment } from '@shared/types'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  env: GameEnvironment | null
  loading: boolean
  onSelect: () => Promise<boolean>
  onSetup?: () => void
}

export function GameDirCard({ env, loading, onSelect, onSetup }: Props): React.JSX.Element {
  const { t } = useI18n()
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <MonitorCog className="h-5 w-5 text-muted-foreground" />
            {t('dir.title')}
          </CardTitle>
          <CardDescription>{t('dir.desc')}</CardDescription>
        </div>
        <Button variant="outline" onClick={() => void onSelect()}>
          <FolderSearch className="mr-1" />
          {t('dir.select')}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-6 w-2/3" />
        ) : env ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <code className="truncate text-sm text-muted-foreground">{env.executablePath}</code>
              <Badge variant="success">{t('dir.valid')}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">
                {t('dir.version')} {env.gameVersion || t('banana.unknown')}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void window.api.ui.openFolder(env.rootPath)}
              >
                <FolderOpen className="mr-1 h-4 w-4" />
                {t('dir.openFolder')}
              </Button>
              {onSetup && (
                <Button variant="outline" size="sm" onClick={() => onSetup()}>
                  <Wrench className="mr-1 h-4 w-4" />
                  {t('settings.setup')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('dir.none')}</p>
        )}
      </CardContent>
    </Card>
  )
}