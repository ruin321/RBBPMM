import { cn } from '@/lib/utils';
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
    return (<div className={cn('relative overflow-hidden rounded-md bg-primary/10', className)} {...props}>
      
      <div className="absolute inset-y-0 left-0 w-1/2 animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent"/>
    </div>);
}
export { Skeleton };
