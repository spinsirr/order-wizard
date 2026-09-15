import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from './ui/alert-dialog';

export type ConfirmData =
  | { type: 'single'; orderId: string; message: string }
  | { type: 'bulk'; orderIds: string[]; message: string };

interface DeleteConfirmModalProps {
  confirmData: ConfirmData;
  isDeleting: boolean;
  error?: Error | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  confirmData,
  isDeleting,
  error,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !isDeleting) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="size-10 border border-destructive/20 bg-destructive/10 text-destructive">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{confirmData.message}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmData.type === 'bulk'
              ? 'This action cannot be undone and will remove all selected orders from your list.'
              : 'This action cannot be undone and will remove the order from your list.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" size="sm" disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            size="sm"
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
