import { ArrowRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MachineDefinition, simulateDefinition } from '@/demo/state-machine-prototype/model';

export function MachineSimulator({
  definition,
  simulation,
  onEvent,
  onRestart,
}: {
  definition: MachineDefinition;
  simulation: ReturnType<typeof simulateDefinition> | null;
  onEvent: (id: string) => void;
  onRestart: () => void;
}) {
  const name = (id: string) => definition.states.find((state) => state.id === id)?.name;
  return (
    <section className="space-y-3" aria-label="试走订单">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title font-semibold">试走一笔订单</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="重新开始模拟订单"
          disabled={!simulation}
          onClick={onRestart}
        >
          <RotateCcw />
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">模拟订单 #001 · 编辑规则后会回到起点</p>
      {!simulation ? (
        <p className="text-body text-muted-foreground">修正下方的问题后，就可以试走流程。</p>
      ) : (
        <>
          <div className="rounded-lg border bg-card p-3" aria-live="polite">
            <p className="text-caption text-muted-foreground">
              {simulation.done ? '已到达终点' : '当前状态'}
            </p>
            <p className="mt-1 text-title font-medium">{name(simulation.current)}</p>
            {simulation.done && (
              <p className="mt-2 text-caption text-muted-foreground">
                流程已结束。可以重新开始，试走另一个分支。
              </p>
            )}
          </div>
          {simulation.available.map((edge) => (
            <Button
              key={edge.id}
              variant="outline"
              className="h-auto min-h-10 w-full justify-between whitespace-normal text-left"
              onClick={() => onEvent(edge.id)}
            >
              <span>
                {edge.action}
                <span className="block text-caption text-muted-foreground">
                  前往 {name(edge.target)}
                </span>
              </span>
              <ArrowRight />
            </Button>
          ))}
          {!simulation.done && !simulation.available.length && (
            <p className="text-caption text-warning">
              还没有后续动作。在画布上为这个状态添加出口。
            </p>
          )}
          <details className="text-caption">
            <summary className="cursor-pointer py-2 text-muted-foreground">
              查看经过的路径（{simulation.history.length} 个状态）
            </summary>
            <ol className="max-h-40 space-y-2 overflow-y-auto border-l pl-3">
              {simulation.history.map((step, index) => (
                // The same state and action can recur in a user-defined cycle.
                // biome-ignore lint/suspicious/noArrayIndexKey: immutable, append-only simulation history
                <li key={index}>
                  <span className="text-muted-foreground">{step.action} → </span>
                  {name(step.state)}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
  );
}
