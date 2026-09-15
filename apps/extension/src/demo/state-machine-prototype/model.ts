import { createMachine, getInitialSnapshot, transition } from 'xstate';

// Storybook experiment: can users define a workflow and understand its behavior?
// This configuration lives only in memory; it is not the persisted order schema.
export type WorkflowState = {
  id: string;
  name: string;
  position: { x: number; y: number };
  final: boolean;
};

export type WorkflowTransition = {
  id: string;
  source: string;
  target: string;
  action: string;
};

export type MachineDefinition = {
  initial: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
};

function reachableStates(definition: MachineDefinition): Set<string> {
  const ids = new Set(definition.states.map((state) => state.id));
  const reachable = new Set<string>();
  const pending = ids.has(definition.initial) ? [definition.initial] : [];
  while (pending.length) {
    const id = pending.pop();
    if (!id || reachable.has(id)) {
      continue;
    }
    reachable.add(id);
    if (definition.states.find((state) => state.id === id)?.final) {
      continue;
    }
    pending.push(
      ...definition.transitions.filter((edge) => edge.source === id).map((edge) => edge.target),
    );
  }
  return reachable;
}

export function inspectDefinition(definition: MachineDefinition) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set(definition.states.map((state) => state.id));
  if (!ids.has(definition.initial)) {
    errors.push('请选择一个状态作为起点。');
  }
  if (ids.size !== definition.states.length) {
    errors.push('状态标识不能重复。');
  }
  if (definition.states.some((state) => !/^[a-z][a-z0-9_]*$/.test(state.id))) {
    errors.push('状态标识需要以字母开头，只能包含小写字母、数字和下划线。');
  }
  if (
    new Set(definition.transitions.map((edge) => edge.id)).size !== definition.transitions.length
  ) {
    errors.push('连线标识不能重复。');
  }
  inspectStates(definition, errors, warnings);
  for (const edge of definition.transitions) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      errors.push('有连线缺少起点或去向。');
    }
    if (!edge.action.trim()) {
      errors.push('请给每条连线的动作命名。');
    }
  }
  const reachable = reachableStates(definition);
  for (const state of definition.states) {
    if (!reachable.has(state.id)) {
      warnings.push(`从起点还走不到「${state.name}」。`);
    }
  }
  return { errors: [...new Set(errors)], warnings };
}

export function simulateDefinition(definition: MachineDefinition, events: string[]) {
  const machine = createMachine({
    id: 'workflow_prototype',
    initial: definition.initial,
    states: Object.fromEntries(
      definition.states.map((state) => [
        state.id,
        state.final
          ? { type: 'final' as const }
          : {
              on: Object.fromEntries(
                definition.transitions
                  .filter((edge) => edge.source === state.id)
                  .map((edge) => [`move.${edge.id}`, { target: edge.target }]),
              ),
            },
      ]),
    ),
  });
  let snapshot = getInitialSnapshot(machine);
  const history = [{ state: String(snapshot.value), action: '开始' }];
  for (const event of events) {
    const edge = definition.transitions.find((item) => item.id === event);
    if (!edge || !snapshot.can({ type: `move.${event}` })) {
      continue;
    }
    [snapshot] = transition(machine, snapshot, { type: `move.${event}` });
    history.push({ state: String(snapshot.value), action: edge.action });
  }
  return {
    current: String(snapshot.value),
    done: snapshot.status === 'done',
    available: definition.transitions.filter((edge) => snapshot.can({ type: `move.${edge.id}` })),
    history,
  };
}

function inspectStates(definition: MachineDefinition, errors: string[], warnings: string[]): void {
  for (const state of definition.states) {
    const outgoing = definition.transitions.filter((edge) => edge.source === state.id);
    if (!state.name.trim()) {
      errors.push('请给每个状态命名。');
    }
    if (state.final && outgoing.length) {
      errors.push(`「${state.name}」是终点：请移除它的出口，或取消终点标记。`);
    }
    if (!state.final && !outgoing.length) {
      warnings.push(`「${state.name}」没有出口；可以添加连线或设为终点。`);
    }
    if (new Set(outgoing.map((edge) => edge.action.trim())).size !== outgoing.length) {
      errors.push(`「${state.name}」的动作名称不能重复。`);
    }
  }
}
