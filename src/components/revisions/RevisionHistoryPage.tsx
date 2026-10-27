import React, { useState } from 'react';
import { History } from 'lucide-react';
import type { ComponentRevision } from '../../types/revisions';
import { ComponentBrowser } from './ComponentBrowser';
import { ComponentRevisions } from './ComponentRevisions';
import { SourceBanner } from './shared';

export const RevisionHistoryPage: React.FC = () => {
  const [selected, setSelected] = useState<ComponentRevision | null>(null);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3 pb-3 border-b border-boomi-cardBorder">
        <div className="p-2 rounded-xl bg-boomi-accent/10 border border-boomi-accent/30 shrink-0">
          <History className="w-5 h-5 text-boomi-accent" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white">RevIQ</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {selected ? 'Pick any two revisions to see exactly what changed.' : 'Choose a component to see its revisions and compare versions.'}
          </p>
        </div>
      </div>

      {selected ? (
        <ComponentRevisions source="live" component={selected} onBack={() => setSelected(null)} />
      ) : (
        <div className="space-y-4">
          <SourceBanner source="live" />
          <ComponentBrowser source="live" onOpen={setSelected} />
        </div>
      )}
    </div>
  );
};
