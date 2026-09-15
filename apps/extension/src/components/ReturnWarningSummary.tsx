import { TriangleAlert } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
  if (warnings.size === 0 && !showingWarnings) {
    return null;
  }
  const overdueCount = [...warnings.values()].filter(
    (warning) => warning.stage === 'overdue',
  ).length;
  const summary =
    warnings.size === 0
      ? 'All return reminders cleared'
      : `${warnings.size} ${warnings.size === 1 ? 'order needs' : 'orders need'} a return check`;
  const details =
    warnings.size === 0
      ? summary
      : `No reimbursement after 25+ days.${overdueCount > 0 ? ` ${overdueCount} at 30+ days.` : ''} Confirm the return deadline on Amazon.`;

  return (
    <Alert
      variant={overdueCount > 0 ? 'destructive' : 'default'}
      className="flex items-center gap-2 px-2 py-1 [&>svg]:translate-y-0"
      role="status"
      aria-label={summary}
      title={details}
    >
      <TriangleAlert
        aria-hidden="true"
        className={overdueCount > 0 ? 'shrink-0' : 'shrink-0 text-warning!'}
      />
      <AlertTitle className="min-w-0 flex-1 truncate text-caption">
        {warnings.size === 0
          ? 'All clear'
          : `${warnings.size} return ${warnings.size === 1 ? 'check' : 'checks'}`}
      </AlertTitle>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-caption"
        onClick={onToggle}
        aria-pressed={showingWarnings}
        aria-label={showingWarnings ? 'Show all orders' : 'Review returns'}
      >
        {showingWarnings ? 'Show all' : 'Review'}
      </Button>
    </Alert>
  );
}
