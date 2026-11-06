import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatbotPage from '../pages/ChatbotPage';
import { mockFetch, renderWithProviders } from '../test/utils';

describe('ChatbotPage', () => {
  it('sends the question with the UI language and renders quick-reply chips from options', async () => {
    const fetchMock = mockFetch({
      'POST /chatbot/query': {
        session_id: '11111111-1111-1111-1111-111111111111',
        intent: 'irrigation_advice',
        language: 'en',
        text: 'Which planting do you mean?',
        status: 'clarification',
        options: [
          { label: 'Tomato — Wadi Farm', value: 'p-1' },
          { label: 'Tomato — Hill Farm', value: 'p-2' },
        ],
        explanation: null,
        nlu: { normalized: 'should i irrigate the tomatoes today', intent: 'irrigation_advice', scores: { irrigation_advice: 3.5 } },
      },
    });
    renderWithProviders(<ChatbotPage />);
    await userEvent.type(screen.getByLabelText('Type a question…'), 'Should I irrigate the tomatoes today?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Which planting do you mean?')).toBeInTheDocument();
    const chips = screen.getByRole('list', { name: 'Quick replies' });
    expect(chips.querySelectorAll('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Tomato — Hill Farm' })).toBeEnabled();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ message: 'Should I irrigate the tomatoes today?', language: 'en', session_id: null });
  });
});
