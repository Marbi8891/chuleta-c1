// src/app/router.tsx
//
// Rutas conceptuales de la Fase 2: "/" (Hoy), "/study", "/study/:topicId",
// "/quiz", "/quiz/run", "/quiz/results", "/flashcards". No hay ruta para
// "Más" (botón deshabilitado en BottomNav, ver comentario allí).
//
// Fase 4, punto 9 (BUNDLE SIZE): Study/Quiz/Flashcards se cargan con
// `React.lazy` — cada uno pasa a ser su propio chunk JS, separado del
// bundle principal. El candidato real detrás de esto es
// react-markdown+remark-gfm (usado solo por StudyArticlePage): son ~1MB
// en node_modules (unified/micromark + sus extensiones GFM) que hasta
// ahora entraban en el chunk principal aunque solo hiciera falta código
// para leer un tema de Estudiar. HomePage se queda fuera del lazy-split
// a propósito (es la landing "/", se necesita en la primera pintura).
//
// Esto NO es "lazy-fetch de contenido académico" (explícitamente
// prohibido en la especificación): los tres JSON de temario/tests/
// flashcards siguen embebidos como módulos ES en tiempo de build (ver
// src/data/index.ts) — ningún dato se pide por red. `React.lazy` solo
// difiere CUÁNDO el navegador pide un chunk de JS ya generado en el
// propio build; ese chunk queda precacheado por el Service Worker igual
// que el resto (ver vite.config.ts, workbox.globPatterns), así que sigue
// disponible offline tras la primera visita — ver
// docs/PWA_ARCHITECTURE.md, sección "Bundle y offline".

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

// Placeholder de carga mínimo — solo se ve una fracción de segundo tras
// el primer precache (chunk ya en caché local) o mientras se descarga por
// primera vez; nunca sustituye a un estado de error ni oculta contenido
// ya cargado (Suspense envuelve solo el <Outlet> de rutas perezosas).
function RouteFallback() {
  return (
    <p className="route-fallback" aria-live="polite">
      Cargando…
    </p>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route
          path="study"
          element={
            <Suspense fallback={<RouteFallback />}>
              <StudyHomePage />
            </Suspense>
          }
        />
        <Route
          path="study/:topicId"
          element={
            <Suspense fallback={<RouteFallback />}>
              <StudyArticlePage />
            </Suspense>
          }
        />
        <Route
          path="quiz"
          element={
            <Suspense fallback={<RouteFallback />}>
              <QuizSetupPage />
            </Suspense>
          }
        />
        <Route
          path="quiz/run"
          element={
            <Suspense fallback={<RouteFallback />}>
              <QuizRunPage />
            </Suspense>
          }
        />
        <Route
          path="quiz/results"
          element={
            <Suspense fallback={<RouteFallback />}>
              <QuizResultsPage />
            </Suspense>
          }
        />
        <Route
          path="flashcards"
          element={
            <Suspense fallback={<RouteFallback />}>
              <FlashcardsPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
