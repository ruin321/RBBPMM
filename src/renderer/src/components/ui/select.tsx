import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
export interface SelectOption {
    value: string;
    label?: string;
}
interface SelectProps {
    value: string;
    onChange: (value: string) => void;
    options: (string | SelectOption)[];
    className?: string;
    ariaLabel?: string;
    placeholder?: string;
}
function toOptions(options: (string | SelectOption)[]): SelectOption[] {
    return options.map((o) => typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value });
}
export function Select({ value, onChange, options, className, ariaLabel, placeholder }: SelectProps): React.JSX.Element {
    const opts = useMemo(() => toOptions(options), [options]);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const selected = opts.find((o) => o.value === value);
    const selectedIdx = Math.max(0, opts.findIndex((o) => o.value === value));
    useEffect(() => {
        if (!open)
            return;
        const onDoc = (e: MouseEvent): void => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node))
                setOpen(false);
        };
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape')
                setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);
    useEffect(() => {
        if (open) {
            setActive(selectedIdx);
            const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
            el?.scrollIntoView({ block: 'nearest' });
        }
    }, [open, selectedIdx]);
    const onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
                e.preventDefault();
                setOpen(true);
                return;
            }
            e.preventDefault();
            if (e.key === 'ArrowDown')
                setActive((a) => Math.min(opts.length - 1, a + 1));
            else if (e.key === 'ArrowUp')
                setActive((a) => Math.max(0, a - 1));
            else if (e.key === 'Enter' && opts[active]) {
                onChange(opts[active].value);
                setOpen(false);
            }
        }
    };
    return (<div ref={rootRef} className={cn('relative inline-block text-left', className)}>
      <button type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-label={ariaLabel} onClick={() => setOpen((o) => !o)} onKeyDown={onKeyDown} className={cn('flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm outline-none transition-all duration-150', open ? 'border-primary ring-2 ring-ring/40' : 'border-input hover:border-primary/60')}>
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : (placeholder ?? '')}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}/>
      </button>

      
      {open && (<div className="absolute left-0 right-0 top-full z-50 mt-1.5 origin-top animate-[select-pop_.14s_ease-out]">
          <ul ref={listRef} role="listbox" className="max-h-56 overflow-auto rounded-lg border bg-popover p-1 shadow-lg shadow-black/10 backdrop-blur-sm">
            {opts.map((o, i) => {
                const isActive = i === active;
                const isSelected = o.value === value;
                return (<li key={o.value} role="option" aria-selected={isSelected} onMouseEnter={() => setActive(i)} onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                    }} className={cn('flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-100', isActive && 'bg-accent', isSelected && 'text-primary')}>
                  <span className="truncate">{o.label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0"/>}
                </li>);
            })}
          </ul>
        </div>)}
    </div>);
}
