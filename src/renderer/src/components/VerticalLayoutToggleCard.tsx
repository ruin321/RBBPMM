import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LayoutList } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

export function VerticalLayoutToggleCard(): React.JSX.Element {
    const { t } = useI18n();
    const [enabled, setEnabled] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let active = true;
        void window.api.app.getVerticalLayout().then((v) => {
            if (active) {
                setEnabled(v);
                setLoaded(true);
            }
        });
        return () => {
            active = false;
        };
    }, []);

    const onToggle = (v: boolean): void => {
        setEnabled(v);
        void window.api.app.setVerticalLayout(v).then(() => {
            toast.success(t('vertical.restartToast'));
            setTimeout(() => {
                window.location.reload();
            }, 1200);
        });
    };

    return (<Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutList className="h-5 w-5 text-muted-foreground"/>
          {t('vertical.title')}
        </CardTitle>
        <CardDescription>{t('vertical.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t('vertical.enable')}</span>
          <Switch disabled={!loaded} checked={enabled} onCheckedChange={onToggle}/>
        </div>
      </CardContent>
    </Card>);
}
