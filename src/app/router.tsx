// src/app/router.tsx
//
// Rutas: "/" (Hoy), "/study", "/study/:topicId", "/quiz", "/quiz/run",
// "/quiz/results", "/flashcards", "/more" y "/more/tests/:sessionId".
//
// Las features secundarias se cargan con React.lazy para mantener pequeño el
// bundle inicial. El contenido académico sigue embebido localmente; no hay
// fetch de temario/tests/flashcards en runtime.

import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { HomePage } from '../features/home/HomePage';
import { NotFoundPage } from '../features/home/NotFoundPage';

const StudyHomePage = lazy(() =>
  import('../features/study/StudyHomePage').then((m) => ({ default: m.StudyHomePage })),
);
const StudyArticlePage = lazy(() =>
  import('../features/study/StudyArticlePage').then((m) => ({ default: m.StudyArticlePage })),
);
const QuizSetupPage = lazy(() =>
  import('../features/quiz/QuizSetupPage').then((m) => ({ default: m.QuizSetupPage })),
);
const QuizRunPage = lazy(() =>
  import('../features/quiz/QuizRunPage').then((m) => ({ default: m.QuizRunPage })),
);
const QuizResultsPage = lazy(() =>
  import('../features/quiz/QuizResultsPage').then((m) => ({ default: m.QuizResultsPage })),
);
const FlashcardsPage = lazy(() =>
  import('../features/flashcards/FlashcardsPage').then((m) => ({ default: m.FlashcardsPage })),
);
const MorePage = lazy(() =>
  import('../features/more/MorePage').then((m) => ({ default: m.MorePage })),
);
const QuizHistoryDetailPage = lazy(() =>
  import('../features/more/MorePage').then((m) => ({ default: m.QuizHistoryDetailPage })),
);

function RouteFallback() {
  return (
    <p className="route-fallback" aria-live="polite">
      Cargando…
    </p>
  );
}

function lazyRoute(element: React.ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="study" element={lazyRoute(<StudyHomePage />)} />
        <Route path="study/:topicId" element={lazyRoute(<StudyArticlePage />)} />
        <Route path="quiz" element={lazyRoute(<QuizSetupPage />)} />
        <Route path="quiz/run" element={lazyRoute(<QuizRunPage />)} />
        <Route path="quiz/results" element={lazyRoute(<QuizResultsPage />)} />
        <Route path="flashcards" element={lazyRoute(<FlashcardsPage />)} />
        <Route path="more" element={lazyRoute(<MorePage />)} />
        <Route path="more/tests/:sessionId" element={lazyRoute(<QuizHistoryDetailPage />)} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
