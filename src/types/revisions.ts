export type RevisionSource = 'live' | 'sample';
export type ResultSource = RevisionSource | 'upload';

export interface ComponentRevision {
  componentId: string;
  version: number;
  name: string;
  type: string;
  modifiedBy: string | null;
  modifiedDate: string | null;
  createdBy: string | null;
  createdDate: string | null;
  currentVersion: boolean;
  deleted: boolean;
  folderName: string | null;
  description: string | null;
}

export interface RevisionStatus {
  liveConfigured: boolean;
  reason: string | null;
  sampleAvailable: boolean;
}

export interface ComponentListResponse {
  source: RevisionSource;
  components: ComponentRevision[];
  total: number;
  facets: { types: string[]; authors: string[] };
}

export interface ComponentFilters {
  q: string;
  type: string;
  author: string;
  dateFrom: string;
  dateTo: string;
}

export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';
export type ChangeCategory = 'map' | 'setprops' | 'other';

export interface FieldChange {
  field: string;
  old: string | null;
  new: string | null;
  masked: boolean;
  positional: boolean;
}

export interface ChangeEntry {
  id: string;
  category: ChangeCategory;
  changeType: ChangeType;
  scope: string;
  title: string;
  shapeId: string | null;
  shapeName: string | null;
  shapeType: string | null;
  old: Record<string, unknown> | null;
  new: Record<string, unknown> | null;
  fieldChanges: FieldChange[];
  ambiguous: string | null;
  source: { componentId: string; name: string; kind: string; versions: string; shapeId: string } | null;
}

export interface ChangeCounts {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  total: number;
}

export interface ComparisonResult {
  source: ResultSource;
  componentId: string;
  componentName: string;
  kind: string;
  left: Pick<ComponentRevision, 'version' | 'modifiedBy' | 'modifiedDate' | 'name'>;
  right: Pick<ComponentRevision, 'version' | 'modifiedBy' | 'modifiedDate' | 'name'>;
  summary: ChangeCounts & { byCategory: Record<ChangeCategory, ChangeCounts>; ambiguous: number };
  changes: ChangeEntry[];
  warnings: string[];
  resolvedMaps: {
    shapeId: string;
    leftMapId: string;
    rightMapId: string;
    leftVersion: number | null;
    rightVersion: number | null;
    mapName?: string;
  }[];
}
