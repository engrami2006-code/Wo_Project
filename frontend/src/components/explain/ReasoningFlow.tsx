import type { ReactNode } from 'react';
import { BookOpen, Brain, Cpu, FileText, Lightbulb, ListTree } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { Explanation } from '../../types/api';
import { cn } from '../../utils/cn';

export interface FlowNode {
  key: string;
  label: string;
  value: ReactNode;
  caption?: string;
  icon: ReactNode;
  state?: 'default' | 'done' | 'warn';
}

/**
 * Horizontal pipeline of reasoning stages joined by a "pipe" with flowing water dashes.
 * Stacks vertically on small screens. The flow animation is disabled under reduced motion.
 */
export function FlowPipeline({ nodes, label, className }: { nodes: FlowNode[]; label: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn('relative grid gap-3 sm:auto-cols-fr sm:grid-flow-col sm:gap-0', className)}>
        {nodes.map((n, i) => {
          const last = i === nodes.length - 1;
          return (
            <li key={n.key} className="relative flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2 sm:px-1 sm:text-center">
              {/* connector: vertical on mobile, horizontal from sm */}
              {!last ? (
                <>
                  <svg className="absolute start-[1.375rem] top-11 h-[calc(100%-2rem)] w-1 sm:hidden" aria-hidden preserveAspectRatio="none" viewBox="0 0 4 40">
                    <line x1="2" y1="0" x2="2" y2="40" stroke="#CFE3D8" strokeWidth="4" />
                    <line x1="2" y1="0" x2="2" y2="40" stroke="#0EA5E9" strokeWidth="2" strokeDasharray="4 8" className="animate-flow" />
                  </svg>
                  <svg
                    className="absolute top-[1.375rem] hidden h-1 w-full sm:block"
                    style={{ insetInlineStart: '50%' }}
                    aria-hidden
                    preserveAspectRatio="none"
                    viewBox="0 0 100 4"
                  >
                    <line x1="0" y1="2" x2="100" y2="2" stroke="#CFE3D8" strokeWidth="4" vectorEffect="non-scaling-stroke" />
                    <line
                      x1="0"
                      y1="2"
                      x2="100"
                      y2="2"
                      stroke="#0EA5E9"
                      strokeWidth="2"
                      strokeDasharray="4 8"
                      vectorEffect="non-scaling-stroke"
                      className="animate-flow [[dir=rtl]_&]:[animation-direction:reverse]"
                    />
                  </svg>
                </>
              ) : null}
              <span
                className={cn(
                  'relative z-10 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 bg-surface shadow-card',
                  n.state === 'done' && 'border-emerald text-[#047857]',
                  n.state === 'warn' && 'border-warning text-[#92400E]',
                  (!n.state || n.state === 'default') && 'border-forest-100 text-forest-700',
                )}
                aria-hidden
              >
                {n.icon}
              </span>
              <span className="min-w-0 sm:max-w-[9rem]">
                <span className="block text-xs font-medium text-muted">{n.label}</span>
                <span className="tabular block truncate text-sm font-semibold text-ink">{n.value}</span>
                {n.caption ? <span className="block text-[11px] text-muted">{n.caption}</span> : null}
              </span>
            </li>
          );
        })}
    </ol>
  );
}

/** Knowledge Base → Facts → Rules → Inference Engine → Recommendation → Explanation, with counts. */
export function ReasoningFlow({ explanation, className }: { explanation: Explanation; className?: string }) {
  const { t } = useI18n();
  const known = explanation.supporting_facts.filter((f) => !f.derived).length;
  const used = explanation.supporting_facts.filter((f) => f.used).length;
  const fired = explanation.triggered_rules.length;
  const agenda = explanation.trace?.agenda?.length ?? 0;
  const rec = explanation.recommendation;
  const sections =
    [explanation.reason_en, explanation.supporting_facts.length, fired, explanation.alternatives.length, explanation.what_could_change.length, explanation.missing_data.length].filter(
      Boolean,
    ).length;

  const nodes: FlowNode[] = [
    {
      key: 'kb',
      label: t('xai.flow.kb'),
      value: explanation.kb_version ? `v${explanation.kb_version}` : '—',
      caption: t('xai.flow.kbCaption'),
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      key: 'facts',
      label: t('xai.flow.facts'),
      value: t('xai.flow.factsValue', { used, known }),
      caption: t('xai.flow.factsCaption'),
      icon: <ListTree className="h-5 w-5" />,
    },
    {
      key: 'rules',
      label: t('xai.flow.rules'),
      value: t('xai.flow.rulesValue', { n: fired }),
      caption: t('xai.flow.rulesCaption'),
      icon: <FileText className="h-5 w-5" />,
    },
    {
      key: 'engine',
      label: t('xai.flow.engine'),
      value: t('xai.flow.engineValue', { n: agenda }),
      caption: t('xai.flow.engineCaption'),
      icon: <Cpu className="h-5 w-5" />,
    },
    {
      key: 'rec',
      label: t('xai.flow.recommendation'),
      value: rec ? rec.rule : t('xai.flow.none'),
      caption: rec ? t('xai.flow.recCaption') : t('xai.flow.insufficientCaption'),
      icon: <Lightbulb className="h-5 w-5" />,
      state: rec ? 'done' : 'warn',
    },
    {
      key: 'explanation',
      label: t('xai.flow.explanation'),
      value: t('xai.flow.explanationValue', { n: sections }),
      caption: t('xai.flow.explanationCaption'),
      icon: <Brain className="h-5 w-5" />,
      state: 'done',
    },
  ];
  return <FlowPipeline nodes={nodes} label={t('xai.flow.label')} className={className} />;
}
