import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MachineCanvas, type Selection } from '@/demo/state-machine-prototype/MachineCanvas';
import {
  StateInspector,
  TransitionInspector,
} from '@/demo/state-machine-prototype/MachineInspector';
import { MachineSimulator } from '@/demo/state-machine-prototype/MachineSimulator';
import {
  inspectDefinition,
  type MachineDefinition,
  simulateDefinition,
} from '@/demo/state-machine-prototype/model';

export function WorkflowDesignerPrototype({
  initialDefinition,
}: {
  initialDefinition: MachineDefinition;
}) {
  const [definition, setDefinition] = useState(() => structuredClone(initialDefinition));
  const [selection, setSelection] = useState<Selection>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const inspection = useMemo(() => inspectDefinition(definition), [definition]);
  const simulation = useMemo(
    () => (inspection.errors.length ? null : simulateDefinition(definition, events)),
    [definition, events, inspection.errors.length],
  );
  const selectedState =
    selection?.kind === 'state'
      ? definition.states.find((state) => state.id === selection.id)
      : undefined;
  const selectedEdge =
    selection?.kind === 'transition'
      ? definition.transitions.find((edge) => edge.id === selection.id)
      : undefined;
  const edit = (next: MachineDefinition) => {
    setDefinition(next);
    setEvents([]);
  };
  const addTransition = (source: string, target: string) => {
    const id = `edge_${crypto.randomUUID().replaceAll('-', '')}`;
    const existing = new Set(
      definition.transitions.filter((edge) => edge.source === source).map((edge) => edge.action),
    );
    let action = '新动作';
    for (let index = 2; existing.has(action); index++) {
      action = `新动作 ${index}`;
    }
    edit({
      ...definition,
      transitions: [...definition.transitions, { id, source, target, action }],
    });
    setSelection({ kind: 'transition', id });
  };

  return (
    <main className="machine-prototype min-h-screen bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-4">
        <div>
          <h1 className="text-heading font-semibold">设计你的订单流程</h1>
          <p className="mt-1 text-caption text-muted-foreground">
            状态机原型 · 当前草稿仅保留在这个页面
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const id = `state_${crypto.randomUUID().replaceAll('-', '')}`;
              const bottom = Math.max(0, ...definition.states.map((state) => state.position.y));
              edit({
                ...definition,
                states: [
                  ...definition.states,
                  { id, name: '新状态', final: false, position: { x: 200, y: bottom + 150 } },
                ],
              });
              setSelection({ kind: 'state', id });
              setCanvasVersion((value) => value + 1);
            }}
          >
            <Plus />
            添加状态
          </Button>
        </div>
      </header>
      <div className="grid min-h-[660px] grid-cols-1 md:h-[calc(100vh-86px)] md:min-h-0 md:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex min-h-[500px] min-w-0 flex-col" aria-label="流程设计">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 text-caption text-muted-foreground">
            <span>从状态底部的圆点拖到另一个状态顶部，松开连线</span>
            <span>
              {definition.states.length} 个状态 · {definition.transitions.length} 条连线 ·{' '}
              {definition.states.filter((state) => state.final).length} 个终点
            </span>
          </div>
          <div className="min-h-[440px] flex-1">
            <MachineCanvas
              key={canvasVersion}
              definition={definition}
              current={simulation?.current}
              selection={selection}
              onSelect={setSelection}
              onConnect={addTransition}
              onReconnect={(id, source, target) => {
                edit({
                  ...definition,
                  transitions: definition.transitions.map((edge) =>
                    edge.id === id ? { ...edge, source, target } : edge,
                  ),
                });
                setSelection({ kind: 'transition', id });
              }}
              onMove={(positions) =>
                setDefinition((current) => ({
                  ...current,
                  states: current.states.map((state) =>
                    positions.has(state.id)
                      ? { ...state, position: positions.get(state.id) ?? state.position }
                      : state,
                  ),
                }))
              }
            />
          </div>
        </section>
        <aside className="space-y-5 overflow-y-auto border-t bg-card p-5 md:border-t-0 md:border-l">
          {selectedState ? (
            <StateInspector
              definition={definition}
              state={selectedState}
              onChange={(next) =>
                edit({
                  ...definition,
                  states: definition.states.map((state) => (state.id === next.id ? next : state)),
                })
              }
              onInitial={() => edit({ ...definition, initial: selectedState.id })}
              onRemove={() => {
                edit({
                  initial: definition.initial === selectedState.id ? '' : definition.initial,
                  states: definition.states.filter((state) => state.id !== selectedState.id),
                  transitions: definition.transitions.filter(
                    (edge) => edge.source !== selectedState.id && edge.target !== selectedState.id,
                  ),
                });
                setSelection(null);
              }}
              onSelect={setSelection}
            />
          ) : selectedEdge ? (
            <TransitionInspector
              definition={definition}
              edge={selectedEdge}
              onChange={(next) =>
                edit({
                  ...definition,
                  transitions: definition.transitions.map((edge) =>
                    edge.id === next.id ? next : edge,
                  ),
                })
              }
              onRemove={() => {
                edit({
                  ...definition,
                  transitions: definition.transitions.filter((edge) => edge.id !== selectedEdge.id),
                });
                setSelection(null);
              }}
            />
          ) : (
            <section className="space-y-2">
              <h2 className="text-title font-semibold">由你决定怎么走</h2>
              <p className="text-body text-muted-foreground">
                拖动状态底部的圆点，连到另一个状态。连好后，给这个动作起个名字。
              </p>
              <p className="text-caption text-muted-foreground">
                点击状态可设置起点和终点；选中连线后可拖动端点，修改去向。
              </p>
            </section>
          )}
          <div className="border-t pt-5">
            <MachineSimulator
              definition={definition}
              simulation={simulation}
              onEvent={(id) => setEvents((current) => [...current, id])}
              onRestart={() => setEvents([])}
            />
          </div>
          {(inspection.errors.length > 0 || inspection.warnings.length > 0) && (
            <section className="space-y-2 border-t pt-4" aria-label="流程检查">
              <h2 className="text-caption font-medium">流程检查</h2>
              {inspection.errors.map((message) => (
                <p key={message} className="text-caption text-destructive" role="alert">
                  {message}
                </p>
              ))}
              {inspection.warnings.map((message) => (
                <p key={message} className="text-caption text-warning">
                  {message}
                </p>
              ))}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
