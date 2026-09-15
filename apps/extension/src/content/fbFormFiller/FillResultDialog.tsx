import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FillResult } from './formFiller';

export function FillResultDialog({
  results,
  onRetry,
  onKeep,
  onDone,
}: {
  results: FillResult[];
  onRetry: () => void;
  onKeep: () => void;
  onDone: () => void;
}) {
  const failed = results.filter((result) => result.error);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onKeep();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {failed.length ? 'Some fields need your help' : 'Listing details filled'}
          </DialogTitle>
          <DialogDescription>
            Your draft is saved. Review the Facebook form before publishing.
          </DialogDescription>
        </DialogHeader>
        {failed.length > 0 && (
          <ul className="space-y-2 text-body">
            {failed.map((result) => (
              <li key={result.field}>
                <strong>{result.field}:</strong> {result.error}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onKeep}>
            Keep draft
          </Button>
          {failed.length > 0 && <Button onClick={onRetry}>Retry failed fields</Button>}
          <Button variant="outline" onClick={onDone}>
            Clear saved draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
