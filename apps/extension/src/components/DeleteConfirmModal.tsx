import { Button } from './ui/button';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">{confirmData.message}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {confirmData.type === 'bulk'
            ? 'This action cannot be undone and will remove all selected orders from your list.'
            : 'This action cannot be undone and will remove the order from your list.'}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}
