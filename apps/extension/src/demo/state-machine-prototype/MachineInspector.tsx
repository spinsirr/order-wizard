import { ArrowRight, Trash2 } from 'lucide-react';
import { useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Selection } from '@/demo/state-machine-prototype/MachineCanvas';
import type {
  MachineDefinition,
  WorkflowState,
  WorkflowTransition,
} from '@/demo/state-machine-prototype/model';

function RemoveDraftItem({
  name,
  description,
  onRemove,
}: {
  name: string;
  description: string;
  onRemove: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          <Trash2 />
          删除{name}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除{name}？</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onRemove}>
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function StateInspector({
  definition,
  state,
  onChange,
  onInitial,
  onRemove,
  onSelect,
}: {
  definition: MachineDefinition;
  state: WorkflowState;
  onChange: (state: WorkflowState) => void;
  onInitial: () => void;
  onRemove: () => void;
  onSelect: (selection: Selection) => void;
}) {
  const outgoing = definition.transitions.filter((edge) => edge.source === state.id);
  return (
    <section className="space-y-4" aria-label="编辑状态">
      <h2 className="text-title font-semibold">编辑状态</h2>
      <div className="space-y-2">
        <Label htmlFor="state-name">状态名称</Label>
        <Input
          id="state-name"
          value={state.name}
          maxLength={40}
          onChange={(event) => onChange({ ...state, name: event.target.value })}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={state.id === definition.initial}
        onClick={onInitial}
      >
        {state.id === definition.initial ? '当前起点' : '设为起点'}
      </Button>
      <div className="space-y-2">
        <div className="flex min-h-8 items-center gap-2">
          <Checkbox
            id="state-final"
            checked={state.final}
            onCheckedChange={(checked) => onChange({ ...state, final: checked === true })}
          />
          <Label htmlFor="state-final">这是一个终点</Label>
        </div>
        <p className="text-caption text-muted-foreground">
          终点可以有多个。订单到达后停止流转；需要回退的状态请保留出口。
        </p>
      </div>
      <div className="space-y-2 border-t pt-3">
        <h3 className="text-caption font-medium">从这里可以做什么</h3>
        {outgoing.map((edge) => (
          <Button
            key={edge.id}
            variant="outline"
            className="h-auto min-h-9 w-full justify-between whitespace-normal text-left"
            onClick={() => onSelect({ kind: 'transition', id: edge.id })}
          >
            <span>
              {edge.action || '未命名动作'}
              <span className="block text-caption text-muted-foreground">
                前往 {definition.states.find((item) => item.id === edge.target)?.name}
              </span>
            </span>
            <ArrowRight />
          </Button>
        ))}
        {!state.final && (
          <p className="text-caption text-muted-foreground">
            从这个状态底部的圆点拖出连线，松开到目标状态顶部的圆点。
          </p>
        )}
        {state.final && <p className="text-caption text-muted-foreground">终点没有后续动作。</p>}
      </div>
      <RemoveDraftItem
        name="状态"
        description={`将删除「${state.name}」和与它相连的 ${definition.transitions.filter((edge) => edge.source === state.id || edge.target === state.id).length} 条连线，仅影响当前草稿。`}
        onRemove={onRemove}
      />
    </section>
  );
}

export function TransitionInspector({
  definition,
  edge,
  onChange,
  onRemove,
}: {
  definition: MachineDefinition;
  edge: WorkflowTransition;
  onChange: (edge: WorkflowTransition) => void;
  onRemove: () => void;
}) {
  const focusAction = useCallback((element: HTMLInputElement | null) => element?.focus(), []);
  return (
    <section className="space-y-4" aria-label="编辑连线">
      <h2 className="text-title font-semibold">编辑连线</h2>
      <div className="space-y-2">
        <Label htmlFor="transition-action">执行什么动作</Label>
        <Input
          key={edge.id}
          id="transition-action"
          ref={focusAction}
          value={edge.action}
          maxLength={40}
          onChange={(event) => onChange({ ...edge, action: event.target.value })}
        />
      </div>
      <section className="space-y-1 rounded-md border p-3 text-body" aria-label="当前连线">
        <p>{definition.states.find((state) => state.id === edge.source)?.name}</p>
        <ArrowRight className="size-4 rotate-90 text-muted-foreground" aria-hidden="true" />
        <p>{definition.states.find((state) => state.id === edge.target)?.name}</p>
      </section>
      <p className="text-caption text-muted-foreground">
        拖动画布上这条线的端点，就能重新连接。想要回退，再画一条反向连线。
      </p>
      <RemoveDraftItem
        name="连线"
        description={`删除后，模拟订单将不能再执行「${edge.action}」。`}
        onRemove={onRemove}
      />
    </section>
  );
}
