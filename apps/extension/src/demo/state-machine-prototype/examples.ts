import type { MachineDefinition } from '@/demo/state-machine-prototype/model';

export const ORDER_MACHINE_EXAMPLE: MachineDefinition = {
  initial: 'pending',
  states: [
    { id: 'pending', name: '待评价', position: { x: 200, y: 0 }, final: false },
    { id: 'submitted', name: '已评价', position: { x: 200, y: 150 }, final: false },
    { id: 'waiting', name: '待返款（评价已展示）', position: { x: 200, y: 300 }, final: false },
    { id: 'received', name: '已到账', position: { x: 30, y: 480 }, final: true },
    { id: 'closed', name: '已结束（未返款）', position: { x: 370, y: 480 }, final: true },
  ],
  transitions: [
    { id: 'submit', source: 'pending', target: 'submitted', action: '提交评价' },
    { id: 'reveal', source: 'submitted', target: 'waiting', action: '确认评价已展示' },
    { id: 'receive', source: 'waiting', target: 'received', action: '确认到账' },
    { id: 'close', source: 'waiting', target: 'closed', action: '结束跟进' },
  ],
};

export const BLANK_MACHINE_EXAMPLE: MachineDefinition = {
  initial: 'start',
  states: [{ id: 'start', name: '开始', position: { x: 180, y: 100 }, final: false }],
  transitions: [],
};
