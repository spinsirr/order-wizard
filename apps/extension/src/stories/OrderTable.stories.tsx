import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { OrderTable } from '@/components/OrderTable';
import { mockOrderList } from '@/demo/fixtures';
import { MockOrdersProvider } from '@/stories/mockOrders';
import { OrderStatus } from '@/types';

const meta = {
  title: 'Orders/List',
  args: { scenario: 'mixed', onChange: fn() },
  argTypes: {
    scenario: { control: 'select', options: ['mixed', 'all-reimbursed', 'empty', 'loading'] },
  },
  render: function Render(args, context) {
    const orders =
      args.scenario === 'empty'
        ? []
        : mockOrderList().map((order) =>
            args.scenario === 'all-reimbursed'
              ? { ...order, status: OrderStatus.Reimbursed }
              : order,
          );
    return (
      <div className="story-panel">
        <MockOrdersProvider
          key={`${context.id}-${args.scenario}`}
          initialOrders={orders}
          isLoading={args.scenario === 'loading'}
          onChange={args.onChange}
        >
          <OrderTable />
        </MockOrdersProvider>
      </div>
    );
  },
} satisfies Meta<{ scenario: string; onChange: (...args: unknown[]) => void }>;

export default meta;
type Story = StoryObj<typeof meta>;
export const MixedOrders: Story = {};
export const AllReimbursed: Story = { args: { scenario: 'all-reimbursed' } };
export const Empty: Story = { args: { scenario: 'empty' } };
export const Loading: Story = { args: { scenario: 'loading' } };
