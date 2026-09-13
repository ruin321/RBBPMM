import { toast } from 'sonner';
import { FolderSearch } from 'lucide-react';
import type { GameEnvironment } from '@shared/types';
import { useI18n } from '@/i18n';
import { GameDirCard } from '@/components/GameDirCard';
import { FontPicker } from '@/components/FontPicker';
import { ThemeCard } from '@/components/ThemeCard';
import { LanguagePicker } from '@/components/LanguagePicker';
import { ResetSettingsCard } from '@/components/ResetSettingsCard';
import { SplashToggleCard } from '@/components/SplashToggleCard';
import { AnimationToggleCard } from '@/components/AnimationToggleCard';
import { DebugLogCard } from '@/components/DebugLogCard';
import { PageHeader } from '@/components/PageHeader';
interface Props {
    env: GameEnvironment | null;
    loading: boolean;
    onSelect: () => Promise<boolean>;
    font: string;
    fonts: string[];
    onSelectFont: (font: string) => void;
    themeId: string;
    onSelectTheme: (id: string) => void;
    onSetup: () => void;
}
export function SettingsPage({ env, loading, onSelect, font, fonts, onSelectFont, themeId, onSelectTheme, onSetup }: Props): React.JSX.Element {
    const { t } = useI18n();
    const handleSelect = async (): Promise<boolean> => {
        const ok = await onSelect();
        if (ok)
            toast.success(t('settings.configured'));
        else
            toast.error(t('settings.invalid'));
        return ok;
    };
    return (<div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader icon={<FolderSearch className="h-6 w-6"/>} title={t('settings.title')}/>
      <GameDirCard env={env} loading={loading} onSelect={handleSelect} onSetup={onSetup}/>
      <LanguagePicker />
      <ThemeCard themeId={themeId} onChange={onSelectTheme}/>
      <FontPicker font={font} fonts={fonts} onSelect={onSelectFont}/>
      <SplashToggleCard />
      <AnimationToggleCard />
      <DebugLogCard />
      <ResetSettingsCard />
    </div>);
}
