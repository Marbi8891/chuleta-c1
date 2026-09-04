// src/app/router.tsx
//
// Rutas conceptuales de la Fase 2: "/" (Hoy), "/study", "/study/:topicId",
// "/quiz", "/quiz/run", "/quiz/results", "/flashcards". No hay ruta para
// "Más" (botón deshabilitado en BottomNav, ver comentario allí).

import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { HomePage } from '../features/home/HomePage';
import { NotFoundPage } from '../features/home/NotFoundPage';
import { StudyHomePage } from '../features/study/StudyHomePage';
import { StudyArticlePage } from '../features/study/StudyArticlePage';
import { QuizSetupPage } from '../features/quiz/QuizSetupPage';
import { QuizRunPage } from '../features/quiz/QuizRunPage';
import { QuizResultsPage } from '../features/quiz/QuizResultsPage';
import { FlashcardsPage } from '../features/flashcards/FlashcardsPage';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="study" element={<StudyHomePage />} />
        <Route path="study/:topicId" element={<StudyArticlePage />} />
        <Route path="quiz" element={<QuizSetupPage />} />
        <Route path="quiz/run" element={<QuizRunPage />} />
        <Route path="quiz/results" element={<QuizResultsPage />} />
        <Route path="flashcards" element={<FlashcardsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
