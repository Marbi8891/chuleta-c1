// src/test/renderWithProviders.tsx — helper de test, no forma parte de la app.
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScopeProvider } from '../app/ScopeContext';
import { QuizProvider } from '../app/QuizContext';

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ScopeProvider>
        <QuizProvider>{ui}</QuizProvider>
      </ScopeProvider>
    </MemoryRouter>,
  );
}
