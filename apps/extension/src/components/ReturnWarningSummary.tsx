import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  if (warnings.size === 0 && !showingWarnings) return null;
  const overdueCount = [...warnings.values()].filter(
    (warning) => warning.stage === 'overdue',
  ).length;

  return (
    <Alert
      variant={overdueCount > 0 ? 'destructive' : 'default'}
      className="px-3 py-2.5"
      role="status"
    >
      <TriangleAlert aria-hidden="true" className={overdueCount > 0 ? '' : 'text-warning!'} />
      <AlertTitle className="line-clamp-none text-caption">
        {warnings.size === 0
          ? 'All return reminders cleared'
          : `${warnings.size} ${warnings.size === 1 ? 'order needs' : 'orders need'} a return check`}
      </AlertTitle>
      <AlertDescription className="text-caption">
        {warnings.size > 0 && (
          <p>
            No reimbursement after 25+ days.
            {overdueCount > 0 ? ` ${overdueCount} at 30+ days.` : ''} Confirm the return deadline on
            Amazon.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-1 h-8 text-caption"
          onClick={onToggle}
          aria-pressed={showingWarnings}
        >
          {showingWarnings ? 'Show all orders' : 'Review returns'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
