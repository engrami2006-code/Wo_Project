import type { TFunction, TKey } from '../i18n';
import type { Lang } from '../types/api';

/**
 * The API returns some operational messages in English only (engine notes, weather status, statistics
 * thresholds…). In the Arabic UI the known message shapes are rendered from the dictionary instead;
 * unknown texts are shown unchanged.
 */
const PATTERNS: [RegExp, TKey, string[]][] = [
  [/^Statistics need at least (\d+) days with records \((\d+) so far\)\.$/, 'server.statsNeedDays', ['min', 'n']],
  [/^No water records yet\.$/, 'server.noWaterRecords', []],
  [/^No hydroponic records yet\.$/, 'server.noHydroRecords', []],
  [/^Not available — record a measured baseline period first\.$/, 'server.noBaseline', []],
  [/^Measured: baseline ([\d.]+) vs current ([\d.]+) L\/m²\/day over the last (\d+) days\..*$/, 'server.measured', ['base', 'current', 'days']],
  [/^Needs at least (\d+) days with records in the current window \((\d+) so far\)\.$/, 'server.needsWindowDays', ['min', 'n']],
  [/^Apparent savings compare the calculated requirement with recorded use\..*$/, 'server.apparentNote', []],
  [/^Weather data is currently unavailable \((.+)\) and no snapshot is saved\.$/, 'server.weatherUnavailable', ['reason']],
  [/^Recent snapshot reused \(within cache window\)\.$/, 'server.weatherReused', []],
  [/^Fresh data fetched from the provider\.$/, 'server.weatherFresh', []],
  [/^Using the latest saved snapshot \(([\d.]+) h old\) because (.+)\.$/, 'server.weatherCached', ['h', 'reason']],
  [/^offline mode is enabled$/, 'server.offlineMode', []],
  [/^Insufficient data to calculate the water requirement\.$/, 'server.calcInsufficient', []],
  [/^ET0 not available \(weather unavailable and no manual ET0\)$/, 'server.noEt0', []],
  [/^gross requirement could not be calculated$/, 'server.noGross', []],
  [/^not perceived$/, 'server.notPerceived', []],
  [/^no snapshot$/, 'server.noSnapshot', []],
  [/^All irrigation runs fit within pump capacity, the allowed window and blocked hours\.$/, 'server.scheduleOk', []],
  [/^(.+): line flow ([\d,.]+) L\/h exceeds pump capacity ([\d,.]+) L\/h\.$/, 'server.flowExceeds', ['task', 'flow', 'cap']],
  [/^proved by a rule$/, 'server.proof.proved', []],
  [/^depends on missing data$/, 'server.proof.missing', []],
  [/^no rule can establish it$/, 'server.proof.none', []],
  [/^known fact$/, 'server.proof.known', []],
  [/^known to be the opposite$/, 'server.proof.opposite', []],
  [/^Forward chaining treats '~x' as a separate known-false atom.*$/, 'server.labNote', []],
  [/^Backward chaining answers a single positive goal symbol\.$/, 'server.bcNote', []],
  [/^Optimal under the selected objective and constraints\.$/, 'land.statement', []],
];

export function serverText(text: string | null | undefined, lang: Lang, t: TFunction): string {
  if (!text) return '';
  if (lang === 'en') return text;
  for (const [re, key, names] of PATTERNS) {
    const m = re.exec(text.trim());
    if (m) {
      const vars: Record<string, string> = {};
      names.forEach((n, i) => {
        const raw = m[i + 1];
        vars[n] = n === 'reason' ? serverText(raw, lang, t) : raw;
      });
      // A leading RLM keeps dir="auto" containers right-to-left even when the sentence starts with a Latin token.
      return `\u200f${t(key, vars)}`;
    }
  }
  return text;
}
