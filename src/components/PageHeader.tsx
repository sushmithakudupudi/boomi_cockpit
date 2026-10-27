import React from 'react';

interface Props {
  icon: React.ElementType;
  title: string;
  description: React.ReactNode;
  /** Optional buttons shown on the right (wrap below the title on narrow screens). */
  actions?: React.ReactNode;
}

/** Module page heading used across the app: icon tile, module name, one-line description. */
export const PageHeader: React.FC<Props> = ({ icon: Icon, title, description, actions }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-boomi-cardBorder">
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2 rounded-xl bg-boomi-accent/10 border border-boomi-accent/30 shrink-0">
        <Icon className="w-5 h-5 text-boomi-accent" />
      </div>
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-white">{title}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
