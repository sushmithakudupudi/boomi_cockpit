export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export const inputCls =
  'bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-boomi-accent focus:ring-2 focus:ring-boomi-accent/20 transition';

/** "5 min ago", "3 days ago"... falls back to the date for anything older than a month. */
export const relativeTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (Number.isNaN(diff)) return iso;
  if (diff < 60) return 'just now';
  const steps: [number, string][] = [[3600, 'min'], [86400, 'hour'], [2592000, 'day']];
  let unit = 60;
  for (const [limit, name] of steps) {
    if (diff < limit) {
      const n = Math.floor(diff / unit);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
    unit = limit;
  }
  return d.toLocaleDateString([], { dateStyle: 'medium' });
};

export const initials = (who: string | null | undefined) => {
  if (!who) return '?';
  const name = who.split('@')[0].replace(/^BOOMI_TOKEN\./, '');
  const parts = name.split(/[.\s_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
};

/** Accent classes per component family, so types are recognisable at a glance. */
export const typeTone = (type: string) => {
  if (type === 'process') return 'bg-sky-500/10 text-sky-300 border-sky-500/30';
  if (type.startsWith('transform')) return 'bg-violet-500/10 text-violet-300 border-violet-500/30';
  if (type.startsWith('profile')) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  if (type === 'connector-settings') return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
  if (type === 'connector-action') return 'bg-orange-500/10 text-orange-300 border-orange-500/30';
  if (type.startsWith('script')) return 'bg-pink-500/10 text-pink-300 border-pink-500/30';
  return 'bg-slate-700/30 text-slate-300 border-slate-600/60';
};

export const GUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

const COMPONENT_TYPES: Record<string, string> = {
  process: 'Process',
  'transform.map': 'Map',
  'transform.function': 'Map Function',
  'connector-settings': 'Connection',
  'connector-action': 'Operation',
  'profile.json': 'JSON Profile',
  'profile.xml': 'XML Profile',
  'profile.flatfile': 'Flat File Profile',
  'profile.db': 'Database Profile',
  'profile.edi': 'EDI Profile',
  processproperty: 'Process Property',
  crossref: 'Cross Reference Table',
  documentcache: 'Document Cache',
  xslt: 'XSLT Stylesheet',
  script: 'Script',
  'script.processing': 'Processing Script',
  'script.mapping': 'Map Script',
  webservice: 'API Service',
  certificate: 'Certificate',
  queue: 'Queue',
  tradingpartner: 'Trading Partner',
};

export const componentTypeLabel = (type: string) => COMPONENT_TYPES[type] ?? type;

/** Readable names for the XML attributes / elements that show up in change paths. */
const FIELD_LABELS: Record<string, string> = {
  operationId: 'Operation',
  connectionId: 'Connection',
  mapId: 'Map',
  processId: 'Process',
  profileId: 'Profile',
  profileType: 'Profile type',
  fromProfile: 'Source profile',
  toProfile: 'Destination profile',
  sourceProfile: 'Source profile',
  targetProfile: 'Destination profile',
  requestProfile: 'Request profile',
  responseProfile: 'Response profile',
  actionType: 'Action',
  connectorType: 'Connector type',
  staticproperty: 'Static value',
  toShape: 'Connects to',
  userlabel: 'Shape label',
  shapetype: 'Shape type',
  label: 'Shape label',
  chunks: 'Threads / units',
  forEachCount: 'Documents per unit',
  retryCount: 'Retry count',
  stopProcessingIfZeroDocuments: 'Stop if no documents',
  allowSimultaneous: 'Allow simultaneous executions',
  fromNamePath: 'Source field',
  toNamePath: 'Target field',
  fromKeyPath: 'Source key path',
  toKeyPath: 'Target key path',
  fromType: 'Source type',
  toType: 'Target type',
  msgTxt: 'Message text',
  script: 'Script',
  description: 'Description',
  elementName: 'Profile element',
  elementId: 'Element key',
  propertyId: 'Property id',
  propertyName: 'Property name',
  defaultValue: 'Default value',
  shouldEncrypt: 'Encrypted',
  valueType: 'Value type',
  connections: 'Connects to',
  folderFullPath: 'Folder',
  name: 'Name',
  scope: 'Property scope',
  value: 'Value',
};

const humanize = (s: string) =>
  s
    .replace(/\[[^\]]*\]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

/** Plain-language explanations shown on hover for fields whose raw values are easy to misread. */
const FIELD_HINTS: Record<string, string> = {
  elementId: "Boomi's internal key for the element inside the profile. Every node in the profile tree is numbered, including Root and Object, so the first field under Root/Object is usually key 3. It is not the element's position in the list.",
  propertyId: 'Internal identifier of the document or process property.',
  profileId: 'The profile component this element belongs to (shown by name).',
};

const attrName = (path: string) => {
  const m = path.match(/(?:^|\/)([^/]*?)(?:@([\w.:-]+)|#text)$/);
  return m ? (m[2] ?? m[1].replace(/\[[^\]]*\]$/, '')) : path;
};

export const fieldHint = (path: string): string | undefined => FIELD_HINTS[attrName(path)];

/** "connectoraction/parameters/parametervalue[0]/staticparameter@staticproperty" → "Static value" */
export const fieldLabel = (path: string): string => {
  const m = path.match(/(?:^|\/)([^/]*?)(?:@([\w.:-]+)|#text)$/);
  if (!m) return FIELD_LABELS[path] ?? humanize(path);
  const key = m[2] ?? m[1].replace(/\[[^\]]*\]$/, '');
  return FIELD_LABELS[key] ?? humanize(key || path);
};

/** Values long enough that a highlighted word-level diff reads better than two blobs. */
export const isLongText = (v: string | null | undefined) => !!v && v.length > 80;

export type DiffPart = { text: string; kind: 'same' | 'add' | 'del' };

/** Word-level diff (LCS). Falls back to whole-value replacement for very large inputs. */
export const wordDiff = (a: string, b: string): DiffPart[] => {
  const ta = a.split(/(\s+|[;,(){}=])/).filter(Boolean);
  const tb = b.split(/(\s+|[;,(){}=])/).filter(Boolean);
  if (ta.length * tb.length > 4_000_000) return [{ text: a, kind: 'del' }, { text: b, kind: 'add' }];
  const n = ta.length, m = tb.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (text: string, kind: DiffPart['kind']) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) { push(ta[i], 'same'); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push(ta[i++], 'del');
    else push(tb[j++], 'add');
  }
  while (i < n) push(ta[i++], 'del');
  while (j < m) push(tb[j++], 'add');
  return out;
};
