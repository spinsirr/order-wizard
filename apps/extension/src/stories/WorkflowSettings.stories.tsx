import type { Meta, StoryObj } from '@storybook/react-vite';
import { RESPONSIVE_VIEWPORT_VALUE } from 'storybook/viewport';
import {
  BLANK_MACHINE_EXAMPLE,
  ORDER_MACHINE_EXAMPLE,
} from '@/demo/state-machine-prototype/examples';
import { WorkflowDesignerPrototype } from '@/demo/state-machine-prototype/WorkflowDesignerPrototype';

const meta = {
  title: 'Workflow/Settings',
  component: WorkflowDesignerPrototype,
  args: { initialDefinition: ORDER_MACHINE_EXAMPLE },
  argTypes: { initialDefinition: { control: false } },
  globals: { viewport: { value: RESPONSIVE_VIEWPORT_VALUE, isRotated: false } },
  parameters: { layout: 'fullscreen', controls: { disable: true } },
  render: (args) => (
    <WorkflowDesignerPrototype key={JSON.stringify(args.initialDefinition)} {...args} />
  ),
} satisfies Meta<typeof WorkflowDesignerPrototype>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CustomSteps: Story = { name: '设计状态机' };
export const BlankCanvas: Story = {
  name: '从零开始',
  args: { initialDefinition: BLANK_MACHINE_EXAMPLE },
};
