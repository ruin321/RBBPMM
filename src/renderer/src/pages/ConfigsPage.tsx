import { useEffect, useMemo, useRef, useState } from 'react';
import { FileCog, Search, Trash2, Settings2, Sparkles, Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import type { CfgEntryDto, CfgSectionDto, ConfigFileDto } from '@shared/types';
import { useI18n } from '@/i18n';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { WithTooltip } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
function countEntries(f: ConfigFileDto): number {
    return f.sections.reduce((acc, s) => acc + s.entries.length, 0);
}
interface ConfigsPageProps {
    externalCfgPath?: string | null;
    externalSearch?: string | null;
    onExternalConsumed?: () => void;
}
function parseFileHeading(heading: string | undefined): {
    pluginName?: string;
    gameVer?: string;
    guid?: string;
    raw?: string;
} {
    if (!heading)
        return {};
    const lines = heading.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let pluginName: string | undefined;
    let gameVer: string | undefined;
    let guid: string | undefined;
    for (const line of lines) {
        const created = /^Settings file was created by plugin\s+(.+?)\s*$/i.exec(line);
        if (created) {
            const ver = /^(.*?)\s+in\s+(BB\+?|v[\d.]+|[\d.]+\s*v[\d.]+.*)$/i.exec(created[1]);
            pluginName = ver ? ver[1].trim() : created[1].trim();
            gameVer = ver ? ver[2].trim() : undefined;
            continue;
        }
        const guidMatch = /^Plugin GUID:\s*(\S+?)\s*$/i.exec(line);
        if (guidMatch) {
            guid = guidMatch[1];
        }
    }
    if (!pluginName && !guid)
        return { raw: heading };
    return { pluginName, gameVer, guid };
}
function FileHeadingInfo({ heading }: {
    heading: string;
}): React.JSX.Element {
    const { t } = useI18n();
    const info = parseFileHeading(heading);
    if (info.pluginName || info.guid) {
        return (<div className="mt-1.5 space-y-1.5 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
        {info.pluginName && (<div className="flex flex-wrap items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary"/>
            <span className="text-muted-foreground">{t('config.createdBy')}</span>
            <span className="font-semibold">{info.pluginName}</span>
            {info.gameVer && (<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t('config.gameVersion', { version: info.gameVer })}
              </span>)}
          </div>)}
        {info.guid && (<div className="flex flex-wrap items-center gap-1.5">
            <Fingerprint className="h-3.5 w-3.5 text-muted-foreground"/>
            <span className="text-muted-foreground">{t('config.pluginGuidLabel')}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {info.guid}
            </code>
          </div>)}
      </div>);
    }
    return (<CardDescription className="whitespace-pre-line">{heading}</CardDescription>);
}
export function ConfigsPage({ externalCfgPath, externalSearch, onExternalConsumed }: ConfigsPageProps): React.JSX.Element {
    const { t } = useI18n();
    const [files, setFiles] = useState<ConfigFileDto[] | null>(null);
    const [selected, setSelected] = useState<ConfigFileDto | null>(null);
    const [search, setSearch] = useState('');
    const [saveTick, setSaveTick] = useState(0);
    const [deleteTarget, setDeleteTarget] = useState<ConfigFileDto | null>(null);
    const [deleting, setDeleting] = useState(false);
    const fileScrollRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        let active = true;
        void window.api.configs.list().then((res) => {
            if (!active)
                return;
            if (res.ok && res.value) {
                setFiles(res.value);
                if (res.value.length && !selected)
                    setSelected(res.value[0]);
            }
            else {
                setFiles([]);
            }
        });
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        if (!files || files.length === 0)
            return;
        if (externalCfgPath) {
            const norm = (s: string): string => s.toLowerCase().replace(/\\/g, '/');
            const hit = files.find((f) => norm(f.path) === norm(externalCfgPath));
            if (hit) {
                setSelected(hit);
                setSearch('');
            }
            onExternalConsumed?.();
            return;
        }
        if (externalSearch) {
            setSearch(externalSearch);
            onExternalConsumed?.();
        }
    }, [files, externalCfgPath, externalSearch]);
    const fileFilter = search.trim().toLowerCase();
    const filteredFiles = useMemo(() => {
        if (!files)
            return [];
        if (!fileFilter)
            return files;
        return files.filter((f) => {
            if (f.fileName.toLowerCase().includes(fileFilter))
                return true;
            return f.sections.some((s) => s.entries.some((e) => e.key.toLowerCase().includes(fileFilter)));
        });
    }, [files, fileFilter]);
    const visibleSections = useMemo(() => (selected ? selected.sections : []), [selected]);
    const save = (section: string, entry: CfgEntryDto, rawValue: string): void => {
        if (!selected)
            return;
        const prev = entry.value;
        setSelected((cur) => (cur ? updateEntry(cur, section, entry.key, rawValue) : cur));
        void window.api.configs.set(selected.path, section, entry.key, rawValue).then((res) => {
            if (res.ok) {
                setSaveTick((n) => n + 1);
            }
            else {
                setSelected((cur) => (cur ? updateEntry(cur, section, entry.key, prev) : cur));
                toast.error(t('config.saveFail'));
            }
        });
    };
    const confirmDelete = async (): Promise<void> => {
        if (!deleteTarget)
            return;
        setDeleting(true);
        try {
            const res = await window.api.configs.delete(deleteTarget.path);
            if (res.ok) {
                setFiles((cur) => (cur ? cur.filter((f) => f.path !== deleteTarget.path) : cur));
                if (selected?.path === deleteTarget.path)
                    setSelected(null);
                setDeleteTarget(null);
                toast.success(t('config.deleteDone'));
            }
            else {
                toast.error(res.error || t('config.deleteFail'));
            }
        }
        catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
        }
        finally {
            setDeleting(false);
        }
    };
    if (files === null) {
        return <div className="text-sm text-muted-foreground">...</div>;
    }
    return (<div className="flex h-full flex-col gap-5">
      <PageHeader icon={<Settings2 className="h-6 w-6"/>} title={t('config.title')} desc={t('config.desc')}>
        {selected && saveTick > 0 && (<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>
            {t('config.saved')}
          </span>)}
      </PageHeader>

      <div className="relative min-h-0 flex-1">
        <div className="h-full gap-5 lg:grid lg:grid-cols-[290px_1fr]">
          
          <aside className="hidden h-full flex-col gap-3 overflow-hidden lg:flex">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('config.search')} className="h-9 rounded-xl pl-8"/>
            </div>
            <div ref={fileScrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-xl pr-1">
              {filteredFiles.length === 0 ? (<div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                  <FileCog className="h-8 w-8"/>
                  <p className="text-sm">
                    {files && files.length === 0 ? t('config.noCfg') : t('config.searchEmpty')}
                  </p>
                </div>) : (filteredFiles.map((f) => (<div key={f.path} onClick={() => setSelected(f)} className={cn('group relative flex cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-xl border px-3 py-2.5 text-sm transition-all', selected?.path === f.path
                ? 'border-primary/40 bg-primary/10 shadow-sm'
                : 'border-transparent hover:bg-muted/70')}>
                    
                    <span className={cn('absolute inset-y-0 left-0 w-1 bg-primary transition-opacity', selected?.path === f.path ? 'opacity-100' : 'opacity-0')}/>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors', selected?.path === f.path
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground')}>
                        <FileCog className="h-4 w-4"/>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium leading-tight">
                          {f.fileName}
                        </span>
                        <span className={cn('mt-0.5 block text-[11px] leading-tight', selected?.path === f.path ? 'text-primary/80' : 'text-muted-foreground/70')}>
                          {countEntries(f)} {t('config.settingNoun')}
                        </span>
                      </span>
                    </span>
                    <WithTooltip title={t('config.deleteHint')}>
                      <button type="button" onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(f);
            }} className={cn('shrink-0 rounded-md p-1.5 text-muted-foreground/60 transition-all hover:bg-destructive/10 hover:text-destructive', selected?.path === f.path ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                        <Trash2 className="h-3.5 w-3.5"/>
                      </button>
                    </WithTooltip>
                  </div>)))}
            </div>
          </aside>

          
          <section className="h-full min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {!selected ? (<Card className="h-full border-dashed">
                <CardContent className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                    <FileCog className="h-7 w-7"/>
                  </div>
                  <p className="max-w-xs text-sm">
                    {files.length === 0 ? t('config.noCfg') : t('config.pick')}
                  </p>
                </CardContent>
              </Card>) : (<div className="space-y-4">
                <Card className="overflow-hidden">
                  <CardHeader className="border-b pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileCog className="h-4 w-4 text-primary"/>
                      {selected.fileName}
                    </CardTitle>
                    {selected.heading ? <FileHeadingInfo heading={selected.heading}/> : null}
                  </CardHeader>
                </Card>
                {visibleSections.length === 0 ? (<div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center text-muted-foreground">
                    <Search className="h-6 w-6"/>
                    <p className="text-sm">{t('config.searchEmpty')}</p>
                  </div>) : (visibleSections.map((s) => (<SectionCard key={s.name} section={s} onSave={save}/>)))}
              </div>)}
          </section>
        </div>
      </div>

      
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !deleting && !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4"/>
              </span>
              {t('config.deleteTitle')}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {deleteTarget ? t('config.deleteDesc', { name: deleteTarget.fileName }) : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              {t('config.deleteCancel')}
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? t('dialog.installing') : t('config.deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);
}
function updateEntry(cfg: ConfigFileDto, section: string, key: string, newVal: string): ConfigFileDto {
    return {
        ...cfg,
        sections: cfg.sections.map((s) => {
            if (s.name !== section)
                return s;
            return {
                ...s,
                entries: s.entries.map((e) => (e.key === key ? { ...e, value: newVal } : e))
            };
        })
    };
}
function SectionCard({ section, onSave }: {
    section: CfgSectionDto;
    onSave: (section: string, entry: CfgEntryDto, value: string) => void;
}): React.JSX.Element {
    return (<section>
      {section.heading && (<h2 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {section.heading}
        </h2>)}
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2.5 border-b bg-muted/40 px-4 py-2.5">
          <span className="h-5 w-1 shrink-0 rounded-full bg-primary"/>
          <CardTitle className="text-sm font-semibold">[{section.name}]</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border px-0">
          {section.entries.map((e) => (<EntryRow key={e.key} entry={e} section={section.name} onSave={onSave}/>))}
        </CardContent>
      </Card>
    </section>);
}
function EntryRow({ entry, section, onSave }: {
    entry: CfgEntryDto;
    section: string;
    onSave: (section: string, entry: CfgEntryDto, value: string) => void;
}): React.JSX.Element {
    const { t } = useI18n();
    return (<div className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/40">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{entry.key}</span>
          {entry.rawType && (<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {entry.rawType}
            </span>)}
        </div>
        {entry.description ? (<p className="mt-1 text-xs leading-relaxed text-muted-foreground whitespace-pre-line">
            {entry.description}
          </p>) : null}
        {entry.defaultValue !== undefined && entry.defaultValue !== entry.value && (<p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
            <span className="inline-block h-px w-2 bg-muted-foreground/40"/>
            {t('config.defaultValue', { value: entry.defaultValue })}
          </p>)}
      </div>

      <div className="flex shrink-0 items-center">
        <Control entry={entry} section={section} onSave={onSave}/>
      </div>
    </div>);
}
function Control({ entry, section, onSave }: {
    entry: CfgEntryDto;
    section: string;
    onSave: (section: string, entry: CfgEntryDto, value: string) => void;
}): React.JSX.Element {
    if (entry.control === 'boolean') {
        const checked = entry.value === 'true';
        return (<Switch checked={checked} onCheckedChange={(v) => onSave(section, entry, v ? 'true' : 'false')}/>);
    }
    if (entry.control === 'select' && entry.acceptable && entry.acceptable.length > 0) {
        return (<Select value={entry.value} onChange={(v) => onSave(section, entry, v)} options={entry.acceptable} className="w-44"/>);
    }
    if (entry.control === 'number') {
        return (<Input type="number" defaultValue={entry.value} min={entry.min} max={entry.max} step={entry.step ?? 1} className="w-32" onBlur={(e) => {
                const v = e.target.value;
                if (v !== entry.value)
                    onSave(section, entry, v);
            }} onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    const v = (e.target as HTMLInputElement).value;
                    if (v !== entry.value)
                        onSave(section, entry, v);
                }
            }}/>);
    }
    return (<Input type="text" defaultValue={entry.value} className="w-48" onBlur={(e) => {
            const v = e.target.value;
            if (v !== entry.value)
                onSave(section, entry, v);
        }} onKeyDown={(e) => {
            if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value;
                if (v !== entry.value)
                    onSave(section, entry, v);
            }
        }}/>);
}
