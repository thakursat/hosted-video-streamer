import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        {
          default: 'bg-accent-light text-accent-hover',
          success: 'bg-success/10 text-success',
          warning: 'bg-warning/10 text-warning',
          danger: 'bg-danger/10 text-danger',
          muted: 'bg-elevated text-text-muted',
        }[variant],
        className,
      )}
      {...props}
    />
  );
}
