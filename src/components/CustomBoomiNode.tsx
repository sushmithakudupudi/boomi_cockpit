import type { FC } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { BoomiNodeData } from '../types/boomi';
import { 
  Radio, 
  Scissors, 
  ShieldCheck, 
  Shuffle, 
  CloudUpload, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Layers
} from 'lucide-react';

export const CustomBoomiNode: FC<NodeProps<Node<BoomiNodeData>>> = ({ data }) => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Radio': return <Radio className="w-5 h-5 text-blue-400" />;
      case 'Scissors': return <Scissors className="w-5 h-5 text-purple-400" />;
      case 'ShieldCheck': return <ShieldCheck className="w-5 h-5 text-emerald-400" />;
      case 'Shuffle': return <Shuffle className="w-5 h-5 text-amber-400" />;
      case 'CloudUpload': return <CloudUpload className="w-5 h-5 text-sky-400" />;
      case 'AlertTriangle': return <AlertTriangle className="w-5 h-5 text-rose-400" />;
      default: return <Layers className="w-5 h-5 text-slate-400" />;
    }
  };

  const isError = data.status === 'error';
  const isSuccess = data.status === 'success';

  return (
    <div 
      title="Click to inspect this process step"
      className={`min-w-[240px] max-w-[280px] rounded-xl p-3 shadow-lg border transition-all duration-300 cursor-pointer hover:ring-2 hover:ring-sky-400/40 ${
        isError 
          ? 'bg-rose-950/40 border-rose-500/80 shadow-rose-950/60 ring-2 ring-rose-500/50 animate-pulse'
          : isSuccess
            ? 'bg-slate-900/90 border-slate-700/80 hover:border-boomi-accent/60'
            : 'bg-slate-900/70 border-slate-800'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-boomi-accent !w-3 !h-3 !-left-1.5" />
      
      {/* Top Bar: System & Status */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-slate-800/90 text-slate-300">
          {data.system || data.type}
        </span>
        <div className="flex items-center gap-1.5">
          {isError ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
              <XCircle className="w-3.5 h-3.5" /> Error
            </span>
          ) : isSuccess ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" /> OK
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">Idle</span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex items-start gap-2.5">
        <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/50 shrink-0">
          {getIcon(data.icon)}
        </div>
        <div className="overflow-hidden">
          <h4 className="text-xs font-bold text-slate-100 truncate">{data.title}</h4>
          <p className="text-[11px] text-slate-400 truncate">{data.subtitle}</p>
        </div>
      </div>

      {/* Error Banner if failed */}
      {isError && data.errorMessage && (
        <div className="mt-2.5 p-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-[10px] text-rose-300 leading-tight">
          <span className="font-semibold block text-rose-200">Keystone AI Alert:</span>
          {data.errorMessage}
        </div>
      )}

      {/* Footer Info: Document Throughput */}
      <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
        <span>In: <strong className="text-slate-200">{data.docsIn}</strong></span>
        <span>Out: <strong className={isError && data.docsOut === 0 ? "text-rose-400" : "text-slate-200"}>{data.docsOut}</strong></span>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-boomi-accent !w-3 !h-3 !-right-1.5" />
    </div>
  );
};
