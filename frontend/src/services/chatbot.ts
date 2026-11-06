import { http } from './api';
import type { ChatReply, Lang, UUID } from '../types/api';

export const chatbotService = {
  query: (message: string, sessionId: UUID | null, language: Lang) =>
    http.post<ChatReply>('/chatbot/query', { message, session_id: sessionId, language }),
};
