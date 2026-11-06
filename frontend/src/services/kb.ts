import { http } from './api';
import type {
  Fact,
  KBOverview,
  LogicAskRequest,
  LogicAskResponse,
  PerceptDef,
  Rule,
  RuleHistory,
  RuleInput,
  UUID,
  ValidationReport,
} from '../types/api';

export const kbService = {
  overview: () => http.get<KBOverview>('/knowledge-base'),
  rules: () => http.get<Rule[]>('/knowledge-base/rules'),
  createRule: (data: RuleInput) => http.post<Rule>('/knowledge-base/rules', data),
  updateRule: (id: UUID, data: RuleInput) => http.patch<Rule>(`/knowledge-base/rules/${id}`, data),
  history: (id: UUID) => http.get<RuleHistory[]>(`/knowledge-base/rules/${id}/history`),
  facts: () => http.get<Fact[]>('/knowledge-base/facts'),
  updateFact: (id: UUID, value: unknown, source?: string | null) =>
    http.patch<Fact>(`/knowledge-base/facts/${id}`, { value, source: source || null }),
  percepts: () => http.get<PerceptDef[]>('/knowledge-base/percepts'),
  validate: () => http.post<ValidationReport>('/knowledge-base/validate', {}),
  ask: (data: LogicAskRequest) => http.post<LogicAskResponse>('/knowledge-base/ask', data),
};
