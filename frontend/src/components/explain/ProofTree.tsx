import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { ProofNode } from '../../types/api';
import { cn } from '../../utils/cn';
import { labelProofStatus, prettyFormula } from '../../utils/labels';
import { serverText } from '../../utils/serverText';

const statusStyles: Record<string, { dot: string; text: string; ring: string }> = {
  proven: { dot: 'bg-emerald', text: 'text-[#04664A]', ring: 'border-emerald/40 bg-[#ECFAF4]' },
  disproven: { dot: 'bg-[#9AA8A1]', text: 'text-muted', ring: 'border-line bg-canvas' },
  unknown: { dot: 'bg-warning', text: 'text-[#92400E]', ring: 'border-warning/40 bg-[#FEF7EC]' },
};

function parseRuleNode(literal: string): { code: string; formula: string } | null {
  const m = /^(R-[A-Z]{3}-\d{3}):\s*(.+)$/.exec(literal);
  return m ? { code: m[1], formula: m[2] } : null;
}

function Node({ node, depth, defaultDepth }: { node: ProofNode; depth: number; defaultDepth: number }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(depth < defaultDepth);
  const rule = parseRuleNode(node.literal);
  const style = statusStyles[node.status] ?? statusStyles.unknown;
  const hasChildren = node.children.length > 0;
  // A goal node is an OR over the rules that conclude it; a rule node is an AND over its premises.
  const kind = rule ? 'AND' : hasChildren && node.children.length > 1 ? 'OR' : null;

  return (
    <li className="relative">
      <div className="flex items-start gap-2 py-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? t('xai.proof.collapse') : t('xai.proof.expand')}
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-forest-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90 rtl:rotate-90')} />
          </button>
        ) : (
          <span className="mt-2 inline-block h-1.5 w-5 shrink-0" aria-hidden>
            <span className={cn('mx-auto block h-1.5 w-1.5 rounded-full', style.dot)} />
          </span>
        )}
        <div className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2 py-1', style.ring)}>
          {kind ? (
            <span className="rounded bg-forest-700 px-1 font-mono text-[10px] font-semibold text-white" title={kind === 'AND' ? t('xai.proof.and') : t('xai.proof.or')}>
              {kind}
            </span>
          ) : null}
          {rule ? (
            <>
              <span className="font-mono text-[11px] font-semibold text-forest-700" dir="ltr">
                {rule.code}
              </span>
              <code className="formula text-xs" dir="ltr">
                {prettyFormula(rule.formula)}
              </code>
            </>
          ) : (
            <code className="formula text-xs font-medium" dir="ltr">
              {prettyFormula(node.literal)}
            </code>
          )}
          <span className={cn('text-[11px] font-medium', style.text)}>{labelProofStatus(t, node.status)}</span>
          {node.reason && !rule ? <span className="text-[11px] text-muted">— {serverText(node.reason, lang, t)}</span> : null}
        </div>
      </div>
      {hasChildren && open ? (
        <ul className="ms-2.5 border-s border-dashed border-forest-200 ps-3">
          {node.children.map((c, i) => (
            <Node key={`${c.literal}-${i}`} node={c} depth={depth + 1} defaultDepth={defaultDepth} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Backward-chaining proof rendered as an indented AND–OR tree with status colours. */
export function ProofTree({ root, defaultDepth = 3, label }: { root: ProofNode; defaultDepth?: number; label?: string }) {
  const { t } = useI18n();
  return (
    <div>
      <ul aria-label={label ?? t('xai.proof.title')} className="text-sm">
        <Node node={root} depth={0} defaultDepth={defaultDepth} />
      </ul>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted" aria-hidden>
        {(['proven', 'disproven', 'unknown'] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', statusStyles[s].dot)} />
            {labelProofStatus(t, s)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded bg-forest-700 px-1 font-mono text-[10px] text-white">AND</span>
          {t('xai.proof.and')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded bg-forest-700 px-1 font-mono text-[10px] text-white">OR</span>
          {t('xai.proof.or')}
        </span>
      </div>
    </div>
  );
}
