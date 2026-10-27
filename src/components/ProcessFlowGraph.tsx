import React from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { CustomBoomiNode } from './CustomBoomiNode';
import type { BoomiNodeData } from '../types/boomi';
import { api } from '../services/api';
import { Sparkles, RotateCcw, AlertTriangle, CheckCircle, Zap, Loader2 } from 'lucide-react';

const nodeTypes = {
  boomiShape: CustomBoomiNode,
};

interface ProcessFlowGraphProps {
  onTriageClick: () => void;
  isReprocessed: boolean;
  onSimulateHeal: () => void;
  onReset: () => void;
  processId?: string;
  processName?: string;
}

export const ProcessFlowGraph: React.FC<ProcessFlowGraphProps> = ({
  onTriageClick,
  isReprocessed,
  onSimulateHeal,
  onReset,
  processId,
  processName,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<BoomiNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [activeProcessName, setActiveProcessName] = React.useState<string>(processName || 'Modbus_Read_Test_Process');
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  // Load real Boomi topology from API whenever processId or processName changes
  React.useEffect(() => {
    let isMounted = true;
    const loadRealTopology = async () => {
      const targetId = processId || '94348d68-6d4e-4679-90be-a35219a02116';
      setIsLoading(true);
      try {
        const top = await api.fetchTopology(targetId);
        if (!isMounted) return;
        if (top && top.nodes && top.nodes.length > 0) {
          setNodes(top.nodes);
          setEdges(top.edges || []);
          setActiveProcessName(top.processName || processName || 'Boomi Process');
        }
      } catch (err) {
        console.warn('Error fetching live Boomi process topology:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadRealTopology();
    return () => {
      isMounted = false;
    };
  }, [processId, processName, setNodes, setEdges]);

  // Update nodes visually when reprocess state changes
  React.useEffect(() => {
    if (isReprocessed) {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.data.status === 'error') {
            return {
              ...node,
              data: {
                ...node.data,
                status: 'success' as const,
                isErrorPoint: false,
                errorMessage: undefined,
                docsOut: 1,
                details: 'Reprocessed & Verified via Boomi Platform.'
              }
            };
          }
          return node;
        })
      );

      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          animated: true,
          style: { stroke: '#10B981' }
        }))
      );
    }
  }, [isReprocessed, setNodes, setEdges]);

  const hasErrorShape = nodes.some((n) => n.data.status === 'error');

  return (
    <div className="relative w-full h-[520px] bg-slate-950/80 rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden flex flex-col">
      {/* Canvas Top Bar */}
      <div className="flex flex-wrap items-center justify-between px-3 sm:px-5 py-3 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur z-10 gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${hasErrorShape ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'}`} />
            <span className="text-sm font-bold text-slate-100 truncate max-w-[280px]" title={activeProcessName}>
              {activeProcessName}
            </span>
          </div>

          <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-medium">
            Boomi Component Topology
          </span>

          {isLoading ? (
            <span className="flex items-center gap-1.5 text-xs text-sky-400 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching Boomi shapes...
            </span>
          ) : hasErrorShape ? (
            <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" /> Shape Execution Error
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
              <CheckCircle className="w-3.5 h-3.5" /> All Shapes Healthy
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {hasErrorShape ? (
            <>
              <button
                onClick={onTriageClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-boomi-blue to-boomi-accent hover:from-blue-600 hover:to-sky-400 text-white text-xs font-semibold shadow-lg shadow-sky-900/30 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                Ask Keystone AI
              </button>
              <button
                onClick={onSimulateHeal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                Reprocess Document
              </button>
            </>
          ) : (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Refresh Topology
            </button>
          )}
        </div>
      </div>

      {/* Main Flow Canvas */}
      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          className="bg-slate-950"
        >
          <Background 
            variant={BackgroundVariant.Dots} 
            gap={20} 
            size={1.2} 
            color="rgb(var(--c-slate-700))" 
          />
          <Controls 
            
          />
          <MiniMap
            nodeColor={(n) => {
              if (n.data?.status === 'error') return '#EF4444';
              if (n.data?.status === 'success') return '#10B981';
              return 'rgb(var(--c-slate-600))';
            }}
            maskColor="rgb(var(--c-slate-950) / 0.7)"
            className="!bg-slate-900/90 !border-slate-800 !rounded-xl !shadow-xl overflow-hidden"
          />
        </ReactFlow>
      </div>

      {/* Canvas Bottom Legend */}
      <div className="px-5 py-2.5 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="font-medium text-slate-300">
            Boomi Topology Engine: Shapes and connections parsed from Dell Boomi Component XML
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Healthy Shape</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>Defect / Trap Shape</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
            <span>Standby</span>
          </div>
        </div>
      </div>
    </div>
  );
};
