import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib';
import {
  FB_CATEGORY_LABELS,
  FB_CONDITION_LABELS,
  FBCategory,
  FBCondition,
  type FBListingData,
} from '@/types';

interface PreviewModalProps {
  listing: FBListingData;
  onConfirm: (listing: FBListingData) => void;
  onCancel: () => void;
}

export function PreviewModal({ listing, onConfirm, onCancel }: PreviewModalProps) {
  const id = useId();
  const [draft, setDraft] = useState(listing);
  const [selectedImages, setSelectedImages] = useState(() => new Set(listing.images));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="pr-8">
          <DialogTitle>Preview listing</DialogTitle>
          <DialogDescription>
            Review the details and choose photos for your Marketplace listing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`${id}-title`}>Title</Label>
          <Input
            id={`${id}-title`}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-price`}>Price</Label>
          <Input
            id={`${id}-price`}
            inputMode="decimal"
            value={draft.price}
            onChange={(event) => setDraft({ ...draft, price: event.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${id}-condition`}>Condition</Label>
            <Select
              value={draft.condition}
              onValueChange={(value) => {
                const condition = Object.values(FBCondition).find((item) => item === value);
                if (condition) {
                  setDraft({ ...draft, condition });
                }
              }}
            >
              <SelectTrigger id={`${id}-condition`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(FBCondition).map((value) => (
                  <SelectItem key={value} value={value}>
                    {FB_CONDITION_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-category`}>Category</Label>
            <Select
              value={draft.category}
              onValueChange={(value) => {
                const category = Object.values(FBCategory).find((item) => item === value);
                if (category) {
                  setDraft({ ...draft, category });
                }
              }}
            >
              <SelectTrigger id={`${id}-category`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(FBCategory).map((value) => (
                  <SelectItem key={value} value={value}>
                    {FB_CATEGORY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-description`}>Description</Label>
          <Textarea
            id={`${id}-description`}
            rows={5}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-body font-medium">Photos ({selectedImages.size} selected)</legend>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {listing.images.map((imageUrl, index) => (
              <Label
                key={imageUrl}
                htmlFor={`${id}-image-${index}`}
                className={cn(
                  'relative block aspect-square cursor-pointer overflow-hidden rounded-md border-2 bg-secondary',
                  selectedImages.has(imageUrl) ? 'border-ring' : 'border-transparent opacity-50',
                )}
              >
                <img
                  src={imageUrl}
                  alt={`Product ${index + 1}`}
                  className="size-full object-cover"
                />
                <Checkbox
                  id={`${id}-image-${index}`}
                  checked={selectedImages.has(imageUrl)}
                  aria-label={`Include product image ${index + 1}`}
                  className="absolute right-1 top-1"
                  onCheckedChange={(checked) =>
                    setSelectedImages((current) => {
                      const next = new Set(current);
                      if (checked === true) {
                        next.add(imageUrl);
                      } else {
                        next.delete(imageUrl);
                      }
                      return next;
                    })
                  }
                />
              </Label>
            ))}
          </div>
        </fieldset>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={selectedImages.size === 0 || !draft.title.trim()}
            onClick={() =>
              onConfirm({
                ...draft,
                images: listing.images.filter((image) => selectedImages.has(image)),
              })
            }
          >
            Add to queue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
