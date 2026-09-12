import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib';
import type { ReturnWarning } from '@/utils/returnWarnings';

interface ReturnWarningSummaryProps {
  warnings: Map<string, ReturnWarning>;
  showingWarnings: boolean;
  onToggle: () => void;
}

export function ReturnWarningSummary({
  warnings,
  showingWarnings,
  onToggle,
}: ReturnWarningSummaryProps) {
  if (warnings.size === 0 && !showingWarnings) return null;
  const overdueCount = [...warnings.values()].filter(
    (warning) => warning.stage === 'overdue',
  ).length;

  return (
    <Card
      elevation="low"
      role="status"
      className="flex items-start gap-3 border border-border px-4 py-3"
    >
      <TriangleAlert
        aria-hidden="true"
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          overdueCount > 0 ? 'text-destructive' : 'text-amber-700 dark:text-amber-400',
        )}
      />
      <div className="min-w-0 text-xs">
        <p className={cn('font-semibold', overdueCount > 0 && 'text-destructive')}>
          {warnings.size === 0
            ? 'All return reminders cleared'
            : `${warnings.size} ${warnings.size === 1 ? 'order needs' : 'orders need'} a return check`}
        </p>
        {warnings.size > 0 && (
          <p className="mt-1 text-muted-foreground">
            No reimbursement after 25+ days.
            {overdueCount > 0 ? ` ${overdueCount} at 30+ days.` : ''} Confirm the return deadline on
            Amazon.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-2 min-h-8"
          onClick={onToggle}
          aria-pressed={showingWarnings}
        >
          {showingWarnings ? 'Show all orders' : 'Review returns'}
        </Button>
      </div>
    </Card>
  );
}
