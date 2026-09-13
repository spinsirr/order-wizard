import { TriangleAlert } from 'lucide-react';
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
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  confirmData,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !isDeleting) onCancel();
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
