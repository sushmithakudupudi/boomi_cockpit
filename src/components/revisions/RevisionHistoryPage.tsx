import React, { useState } from 'react';
import { Database, FlaskConical, Upload } from 'lucide-react';
import type { ComponentRevision, RevisionSource } from '../../types/revisions';
import { ComponentBrowser } from './ComponentBrowser';
import { ComponentRevisions } from './ComponentRevisions';
import { UploadCompare } from './UploadCompare';
import { SourceBanner } from './shared';

type Mode = RevisionSource | 'upload';

const MODES: { id: Mode; label: string; icon: React.ElementType }[] = [
  { id: 'live', label: 'Live Boomi', icon: Database },
  { id: 'sample', label: 'Sample fixtures', icon: FlaskConical },
  { id: 'upload', label: 'Upload XML', icon: Upload },
];

export const RevisionHistoryPage: React.FC = () => {
  const [mode, setMode] = useState<Mode>('live');
  const [selected, setSelected] = useState<ComponentRevision | null>(null);

  const changeMode = (m: Mode) => {
    setMode(m);
    setSelected(null);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-boomi-cardBorder">
        <div>
          <h1 className="text-lg font-bold text-white">Revision History</h1>
          <p className="text-xs text-slate-400 mt-0.5">Browse components, inspect revisions and compare any two versions.</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800 w-fit">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => changeMode(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition cursor-pointer ${mode === id ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}>
              <Icon className={`w-3.5 h-3.5 ${mode === id ? 'text-boomi-accent' : ''}`} />{label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'upload' ? (
        <UploadCompare />
      ) : selected ? (
        <ComponentRevisions source={mode} component={selected} onBack={() => setSelected(null)} />
      ) : (
        <div className="space-y-4">
          <SourceBanner source={mode} />
          <ComponentBrowser source={mode} onOpen={setSelected} onUseSample={() => changeMode('sample')} />
        </div>
      )}
    </div>
  );
};
