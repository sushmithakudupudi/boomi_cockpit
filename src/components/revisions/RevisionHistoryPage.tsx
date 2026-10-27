import React, { useState } from 'react';
import { History } from 'lucide-react';
import { PageHeader } from '../PageHeader';
import type { ComponentRevision, RevisionSource } from '../../types/revisions';
import { ComponentBrowser } from './ComponentBrowser';
import { ComponentRevisions } from './ComponentRevisions';
import { SourceBanner } from './shared';

interface Props {
  onAiDocs?: (source: RevisionSource, component: ComponentRevision, revision: ComponentRevision) => void;
}

export const RevisionHistoryPage: React.FC<Props> = ({ onAiDocs }) => {
  const [selected, setSelected] = useState<ComponentRevision | null>(null);

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        icon={History}
        title="ChangeLens"
        description={selected ? 'Pick any two revisions to see exactly what changed.' : 'Choose a component to see its revisions and compare versions.'}
      />

      {selected ? (
        <ComponentRevisions source="live" component={selected} onBack={() => setSelected(null)}
          onAiDocs={onAiDocs && ((rev) => onAiDocs('live', selected, rev))} />
      ) : (
        <div className="space-y-4">
          <SourceBanner source="live" />
          <ComponentBrowser source="live" onOpen={setSelected} />
        </div>
      )}
    </div>
  );
};
