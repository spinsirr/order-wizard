import {
  Background,
  Controls,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from '@xyflow/react';
import type { MachineDefinition, WorkflowState } from '@/demo/state-machine-prototype/model';
import { cn } from '@/lib/index';
import '@xyflow/react/dist/style.css';
import '@/demo/state-machine-prototype/prototype.css';

export type Selection = { kind: 'state' | 'transition'; id: string } | null;
type StateNode = Node<{ state: WorkflowState; initial: boolean; current: boolean }, 'workflow'>;

function WorkflowNode({ data, selected }: NodeProps<StateNode>) {
  return (
    <div
      className={cn(
        'w-52 rounded-lg border bg-card px-4 py-3 text-body shadow-xs',
        selected && 'border-ring ring-2 ring-ring/20',
        data.state.final && 'border-double border-4',
        data.current && 'bg-secondary',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectableStart={false}
        aria-label="连接到这个状态"
        title="将连线拖到这里"
      />
      <div className="mb-1 flex gap-2 text-caption text-muted-foreground">
        <span>{data.initial ? '起点' : data.state.final ? '终点' : '状态'}</span>
        {data.initial && data.state.final && <span>· 终点</span>}
        {data.current && <span className="font-medium text-foreground">· 当前订单</span>}
      </div>
      <div className="font-medium">{data.state.name || '未命名状态'}</div>
      {!data.state.final && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            isConnectableEnd={false}
            aria-label="从这个状态连接"
            title="拖到另一个状态顶部的圆点"
          />
          <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-caption text-muted-foreground">
            拖出连线
          </span>
        </>
      )}
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNode };

export function MachineCanvas({
  definition,
  current,
  selection,
  onSelect,
  onConnect,
  onReconnect,
  onMove,
}: {
  definition: MachineDefinition;
  current?: string | undefined;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onConnect: (source: string, target: string) => void;
  onReconnect: (id: string, source: string, target: string) => void;
  onMove: (positions: Map<string, { x: number; y: number }>) => void;
}) {
  return (
    <ReactFlow<StateNode>
      nodes={definition.states.map((state) => ({
        id: state.id,
        type: 'workflow',
        position: state.position,
        data: { state, initial: state.id === definition.initial, current: state.id === current },
        selected: selection?.kind === 'state' && selection.id === state.id,
        ariaLabel: `${state.name}${state.final ? '，终点' : ''}`,
      }))}
      edges={definition.transitions.map((edge) => ({
        ...edge,
        label: edge.action || '未命名动作',
        selected: selection?.kind === 'transition' && selection.id === edge.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        ariaLabel: `${definition.states.find((state) => state.id === edge.source)?.name}，${edge.action}，${definition.states.find((state) => state.id === edge.target)?.name}`,
      }))}
      nodeTypes={nodeTypes}
      onNodesChange={(changes) => {
        const positions = new Map<string, { x: number; y: number }>();
        for (const change of changes) {
          if (change.type === 'position' && change.position) {
            positions.set(change.id, change.position);
          }
        }
        if (positions.size) {
          onMove(positions);
        }
      }}
      onNodeClick={(event, node) => {
        // Connecting a handle should leave the new transition selected for naming.
        if (event.target instanceof Element && event.target.closest('.react-flow__handle')) {
          return;
        }
        onSelect({ kind: 'state', id: node.id });
      }}
      onEdgeClick={(_, edge) => onSelect({ kind: 'transition', id: edge.id })}
      onPaneClick={() => onSelect(null)}
      onConnect={(connection) => onConnect(connection.source, connection.target)}
      onReconnect={(edge, connection) => onReconnect(edge.id, connection.source, connection.target)}
      edgesReconnectable
      reconnectRadius={16}
      connectionRadius={28}
      isValidConnection={(connection) =>
        !definition.states.find((state) => state.id === connection.source)?.final
      }
      deleteKeyCode={null}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.25}
      maxZoom={1.5}
      aria-label="可编辑的状态机画布"
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
