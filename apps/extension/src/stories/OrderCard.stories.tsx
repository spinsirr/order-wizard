import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';
import { fn } from 'storybook/test';
import { OrderCard } from '@/components/OrderCard';
import { DEFAULT_STATUS_OPTIONS, OrderStatusSelect } from '@/components/OrderStatusSelect';
import { mockOrder } from '@/demo/fixtures';
import { OrderStatus } from '@/types';
import { getReturnWarning } from '@/utils/returnWarnings';

interface CardArgs {
  status: OrderStatus;
  daysSinceOrder: number;
  productName: string;
  note: string;
  isSelected: boolean;
  onStatusChange: (status: OrderStatus) => void;
  onNoteSave: (note: string) => void;
  onDelete: (id: string) => void;
}

const meta = {
  title: 'Orders/Card',
  args: {
    status: OrderStatus.Uncommented,
    daysSinceOrder: 7,
    productName: mockOrder(7).productName,
    note: 'Follow up with the seller',
    isSelected: false,
    onStatusChange: fn(),
    onNoteSave: fn(),
    onDelete: fn(),
  },
  argTypes: {
    status: { control: 'select', options: Object.values(OrderStatus) },
    daysSinceOrder: { control: { type: 'range', min: 0, max: 45, step: 1 } },
    productName: { control: 'text' },
    note: { control: 'text' },
    isSelected: { control: 'boolean' },
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs<CardArgs>();
    const order = mockOrder(args.daysSinceOrder, {
      status: args.status,
      note: args.note,
      productName: args.productName,
    });
    return (
      <div className="p-3">
        <OrderCard
          order={order}
          returnWarning={getReturnWarning(order) ?? undefined}
          isSelected={args.isSelected}
          hasImageError={false}
          onToggleSelect={() => updateArgs({ isSelected: !args.isSelected })}
          statusControl={
            <OrderStatusSelect
              value={args.status}
              options={DEFAULT_STATUS_OPTIONS}
              productName={args.productName}
              onChange={(status) => {
                args.onStatusChange(status);
                updateArgs({ status });
              }}
            />
          }
          onNoteSave={(_, note) => {
            args.onNoteSave(note);
            updateArgs({ note });
          }}
          onDelete={args.onDelete}
          onImageError={() => {}}
        />
      </div>
    );
  },
} satisfies Meta<CardArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};
export const Commented: Story = { args: { status: OrderStatus.Commented } };
export const Revealed: Story = { args: { status: OrderStatus.CommentRevealed } };
export const ReturnSoon: Story = { args: { status: OrderStatus.Commented, daysSinceOrder: 25 } };
export const ReturnUrgent: Story = {
  args: { status: OrderStatus.CommentRevealed, daysSinceOrder: 29 },
};
export const ThirtyDayMark: Story = { args: { daysSinceOrder: 30 } };
export const PastThirtyDays: Story = { args: { daysSinceOrder: 32 } };
export const Reimbursed: Story = { args: { status: OrderStatus.Reimbursed, daysSinceOrder: 32 } };
export const Selected: Story = { args: { isSelected: true } };
export const LongContent: Story = {
  args: {
    productName:
      'Rechargeable under-cabinet lights with magnetic mounts, adjustable brightness and warm white lighting for kitchen counters · extra-long product title',
    note: 'Seller asked for another follow-up after confirming that the review is visible. Keep the original packaging until the money has arrived.',
  },
};
