import type { TFunction, TKey } from '../i18n';
import type { BadgeTone } from '../components/ui/Badge';

/** Translate a dynamic enum value; falls back to a humanised identifier when no key exists. */
function dyn(t: TFunction, prefix: string, value: string | null | undefined): string {
  if (!value) return '—';
  const key = `${prefix}.${value}` as TKey;
  const out = t(key);
  return out === key ? value.replace(/_/g, ' ') : out;
}

export const labelRole = (t: TFunction, v: string | null | undefined) => dyn(t, 'role', v);
export const labelWaterSource = (t: TFunction, v: string | null | undefined) => dyn(t, 'source', v);
export const labelRecordType = (t: TFunction, v: string | null | undefined) => dyn(t, 'recordType', v);
export const labelStage = (t: TFunction, v: string | null | undefined) => dyn(t, 'stage', v);
export const labelStageStatus = (t: TFunction, v: string | null | undefined) => dyn(t, 'stageStatus', v);
export const labelHydroType = (t: TFunction, v: string | null | undefined) => dyn(t, 'hydroType', v);
export const labelSystemStatus = (t: TFunction, v: string | null | undefined) => dyn(t, 'systemStatus', v);
export const labelSeverity = (t: TFunction, v: string | null | undefined) => dyn(t, 'severity', v);
export const labelAlertStatus = (t: TFunction, v: string | null | undefined) => dyn(t, 'alertStatus', v);
export const labelRecStatus = (t: TFunction, v: string | null | undefined) => dyn(t, 'recStatus', v);
export const labelCertainty = (t: TFunction, v: string | null | undefined) => dyn(t, 'certainty', v);
export const labelDataQuality = (t: TFunction, v: string | null | undefined) => dyn(t, 'dataQuality', v);
export const labelRuleRole = (t: TFunction, v: string | null | undefined) => dyn(t, 'ruleRole', v);
export const labelRuleCategory = (t: TFunction, v: string | null | undefined) => dyn(t, 'ruleCategory', v);
export const labelFactKind = (t: TFunction, v: string | null | undefined) => dyn(t, 'factKind', v);
export const labelWeatherStatus = (t: TFunction, v: string | null | undefined) => dyn(t, 'weatherStatus', v);
export const labelAlgorithm = (t: TFunction, v: string | null | undefined) => dyn(t, 'algorithm', v);
export const labelRecKind = (t: TFunction, v: string | null | undefined) => dyn(t, 'recKind', v);
export const labelPerceptCategory = (t: TFunction, v: string | null | undefined) => dyn(t, 'perceptCategory', v);
export const labelProofStatus = (t: TFunction, v: string | null | undefined) => dyn(t, 'proofStatus', v);
export function labelConstraint(t: TFunction, v: string | null | undefined): string {
  if (!v) return '—';
  const [kind, subject] = v.split(':', 2);
  const label = dyn(t, 'constraint', kind);
  return subject ? `${label} (${subject})` : label;
}
export const labelCspStat = (t: TFunction, v: string | null | undefined) => dyn(t, 'csp.stat', v);
export const labelSearchStat = (t: TFunction, v: string | null | undefined) => dyn(t, 'land.stat', v);
export const labelEt0Source = (t: TFunction, v: string | null | undefined) => dyn(t, 'et0Source', v);
export const labelAction = (t: TFunction, v: string | null | undefined) => dyn(t, 'action', v);

export function severityTone(sev: string | null | undefined): BadgeTone {
  if (sev === 'critical') return 'critical';
  if (sev === 'warning') return 'warning';
  return 'info';
}

export function severityStripe(sev: string | null | undefined): string {
  if (sev === 'critical') return 'bg-critical';
  if (sev === 'warning') return 'bg-warning';
  return 'bg-info';
}

export function weatherTone(status: string | null | undefined, stale?: boolean): BadgeTone {
  if (status === 'fresh') return 'emerald';
  if (status === 'cached') return stale ? 'warning' : 'water';
  return 'neutral';
}

export function ruleRoleTone(role: string | null | undefined): BadgeTone {
  switch (role) {
    case 'decision':
      return 'forest';
    case 'advisory':
      return 'teal';
    case 'alert':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function factKindTone(kind: string | null | undefined): BadgeTone {
  if (kind === 'scientific') return 'water';
  if (kind === 'policy') return 'warning';
  if (kind === 'axiom') return 'violet';
  return 'neutral';
}

/** Render a rule formula string with logic symbols (∧ ¬ ⇒ ∨ ⇔). */
export function prettyFormula(s: string): string {
  return s
    .replace(/<=>/g, '⇔')
    .replace(/=>/g, '⇒')
    .replace(/\s*&\s*/g, ' ∧ ')
    .replace(/\s*\|\s*/g, ' ∨ ')
    .replace(/~/g, '¬');
}
