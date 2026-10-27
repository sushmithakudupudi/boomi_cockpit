import React from 'react';
import { 
  Activity, 
  CheckCircle2, 
  AlertOctagon, 
  Zap, 
  Clock, 
  TrendingUp, 
  TrendingDown 
} from 'lucide-react';

interface StatsOverviewProps {
  totalExecutions: number;
  failedCount: number;
  autoHealedCount: number;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  totalExecutions,
  failedCount,
  autoHealedCount,
}) => {
  const successRate = ((totalExecutions - failedCount) / totalExecutions * 100).toFixed(1);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Metric 1: Total Executions */}
      <div className="p-4 rounded-2xl bg-boomi-card border border-boomi-cardBorder hover:border-slate-700 transition shadow-lg">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium">Total Process Executions</span>
          <Activity className="w-4 h-4 text-sky-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white tracking-tight">{totalExecutions.toLocaleString()}</span>
          <span className="flex items-center text-[11px] font-semibold text-emerald-400">
            <TrendingUp className="w-3 h-3 mr-0.5" /> +12%
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Across 3 Active Atoms</p>
      </div>

      {/* Metric 2: Success Rate */}
      <div className="p-4 rounded-2xl bg-boomi-card border border-boomi-cardBorder hover:border-slate-700 transition shadow-lg">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium">Platform Success Rate</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white tracking-tight">{successRate}%</span>
          <span className="text-[11px] font-semibold text-emerald-400">Target 99.0%</span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
          <div 
            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${successRate}%` }}
          />
        </div>
      </div>

      {/* Metric 3: Critical Incidents */}
      <div className={`p-4 rounded-2xl border transition shadow-lg ${
        failedCount > 0 
          ? 'bg-rose-950/20 border-rose-500/40' 
          : 'bg-boomi-card border-boomi-cardBorder'
      }`}>
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium">Failed / Triage Needed</span>
          <AlertOctagon className={`w-4 h-4 ${failedCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold tracking-tight ${failedCount > 0 ? 'text-rose-400' : 'text-white'}`}>
            {failedCount}
          </span>
          <span className="text-[11px] text-rose-400 font-medium">Actionable</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          {failedCount > 0 ? 'Ready for Companion Triage' : 'All systems operational'}
        </p>
      </div>

      {/* Metric 4: Autonomous Auto-Healed */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-boomi-card to-sky-950/30 border border-sky-500/30 shadow-lg">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium text-sky-200">Companion Auto-Healed</span>
          <Zap className="w-4 h-4 text-boomi-accent" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-boomi-accent tracking-tight">{autoHealedCount}</span>
          <span className="text-[11px] font-semibold text-sky-300">Self-Healed</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Zero manual code change</p>
      </div>

      {/* Metric 5: MTTR (Mean Time to Resolution) */}
      <div className="p-4 rounded-2xl bg-boomi-card border border-boomi-cardBorder hover:border-slate-700 transition shadow-lg">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium">Incident MTTR</span>
          <Clock className="w-4 h-4 text-purple-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white tracking-tight">2.4m</span>
          <span className="flex items-center text-[11px] font-semibold text-emerald-400">
            <TrendingDown className="w-3 h-3 mr-0.5" /> -85%
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Benchmark: 35.0m</p>
      </div>
    </div>
  );
};
