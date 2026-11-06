import { cn } from '../../utils/cn';
import { prettyFormula } from '../../utils/labels';

/** A propositional formula rendered with logic symbols, always left-to-right. */
export function Formula({ text, className }: { text: string; className?: string }) {
  return (
    <code className={cn('formula break-words', className)} dir="ltr">
      {prettyFormula(text)}
    </code>
  );
}

export function RuleFormula({ antecedent, consequent, className }: { antecedent: string; consequent: string; className?: string }) {
  return (
    <code className={cn('formula break-words', className)} dir="ltr">
      {prettyFormula(antecedent)} <span className="text-teal">⇒</span> {prettyFormula(consequent)}
    </code>
  );
}
