import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, useState } from 'react';
import { fn } from 'storybook/test';
import { Button } from '@/components/ui/button';
import { PreviewModal } from '@/content/fbMarketplace/PreviewModalComponent';
import type { FBListingData } from '@/types';

const listing: FBListingData = {
  title: 'Wireless headphones',
  description: 'Lightly used headphones with the original box. Pickup only.',
  price: '35',
  originalPrice: '50',
  condition: 'used_like_new',
  category: 'electronics',
  pickupLocation: '',
  images: ['/icon.svg'],
  orderNumber: '111-2222222-3333333',
  orderDate: '2026-09-01',
};

const meta = {
  title: 'Marketplace/Preview',
  component: PreviewModal,
  args: { listing, onConfirm: fn(), onCancel: fn() },
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    useEffect(() => {
      if (!open) {
        trigger.current?.focus();
      }
    }, [open]);
    const close = () => {
      setOpen(false);
    };
    return (
      <div className="p-4">
        <Button ref={trigger} onClick={() => setOpen(true)}>
          Open listing preview
        </Button>
        {open && (
          <PreviewModal
            {...args}
            onCancel={() => {
              args.onCancel();
              close();
            }}
            onConfirm={(next) => {
              args.onConfirm(next);
              close();
            }}
          />
        )}
      </div>
    );
  },
} satisfies Meta<typeof PreviewModal>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const LongContent: Story = {
  args: {
    listing: {
      ...listing,
      title: 'Wireless headphones with charging case, cables and original packaging',
      description: Array(12).fill(listing.description).join('\n'),
      images: ['/icon.svg', '/icon-128.png'],
    },
  },
};
export const NoPhotos: Story = { args: { listing: { ...listing, images: [] } } };
