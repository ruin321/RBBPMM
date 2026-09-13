import type React from 'react';
export function PageHeader({ icon, title, desc, children }: {
    icon: React.ReactNode;
    title: string;
    desc?: string;
    children?: React.ReactNode;
}): React.JSX.Element {
    return (<div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
          {icon}
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">{title}</h1>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>);
}
