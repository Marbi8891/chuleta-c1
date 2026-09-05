// src/features/errors/ErrorNotebookPage.test.tsx — Study Intelligence, Fase 2.
import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ErrorNotebookPage } from './ErrorNotebookPage';
import { db } from '../../db/db';
import { ERROR_MASTERY_THRESHOLD, processQuizAnswersForErrorNotebook } from '../../db/errorRecords';
import { getQuestionsByTopic, getTopics } from '../../data/index';

function fail(sessionId: string, questionId: string, topicId: string, answeredAt: string) {
  return processQuizAnswersForErrorNotebook(sessionId, [{ questionId, topicId, correct: false, answeredAt }], db);
}

function succeed(sessionId: string, questionId: string, topicId: string, answeredAt: string) {
  return processQuizAnswersForErrorNotebook(sessionId, [{ questionId, topicId, correct: true, answeredAt }], db);
}

describe('Cuaderno de errores', () => {
  it('muestra un mensaje cuando no hay ningún error guardado', async () => {
    renderWithProviders(<ErrorNotebookPage />);
    // useLiveQuery resuelve de forma asíncrona: el primer render es "Cargando…".
    expect(await screen.findByText(/todavía no has fallado ninguna pregunta/i)).toBeInTheDocument();
  });

  it('una pregunta fallada aparece con su enunciado real (resuelto por QuestionId) y estado "Nueva"', async () => {
    const topic = getTopics()[0]!;
    const question = getQuestionsByTopic(topic.id)[0]!;
    await fail('s1', question.id, topic.id, '2026-01-01T00:00:00.000Z');

    renderWithProviders(<ErrorNotebookPage />);
    expect(await screen.findByText(question.stem)).toBeInTheDocument();
    expect(screen.getByText('Nueva')).toBeInTheDocument();
    expect(screen.getByText(topic.id)).toBeInTheDocument();
  });

  it('la pestaña "Pendientes" (por defecto) oculta las dominadas; "Dominadas" las muestra a ellas y solo a ellas', async () => {
    const topic = getTopics()[0]!;
    const [pending, mastered] = getQuestionsByTopic(topic.id);
    if (!pending || !mastered) throw new Error('El primer tema necesita al menos 2 preguntas para este test');

    await fail('s-pending', pending.id, topic.id, '2026-01-01T00:00:00.000Z');
    await fail('s-mastered-fail', mastered.id, topic.id, '2026-01-01T00:00:00.000Z');
    for (let i = 0; i < ERROR_MASTERY_THRESHOLD; i++) {
      const day = String(i + 2).padStart(2, '0');
      await succeed(`s-mastered-ok-${i}`, mastered.id, topic.id, `2026-01-${day}T00:00:00.000Z`);
    }

    renderWithProviders(<ErrorNotebookPage />);
    expect(await screen.findByText(pending.stem)).toBeInTheDocument();
    expect(screen.queryByText(mastered.stem)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Dominadas' }));
    expect(await screen.findByText(mastered.stem)).toBeInTheDocument();
    expect(screen.queryByText(pending.stem)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Todas' }));
    expect(await screen.findByText(pending.stem)).toBeInTheDocument();
    expect(await screen.findByText(mastered.stem)).toBeInTheDocument();
  });

  it('el filtro de tema muestra solo los errores de ese tema', async () => {
    const topics = getTopics();
    const topicA = topics[0]!;
    const topicB = topics.find((t) => t.id !== topicA.id);
    if (!topicB) throw new Error('El banco de temas necesita al menos 2 temas para este test');
    const questionA = getQuestionsByTopic(topicA.id)[0]!;
    const questionB = getQuestionsByTopic(topicB.id)[0]!;

    await fail('sa', questionA.id, topicA.id, '2026-01-01T00:00:00.000Z');
    await fail('sb', questionB.id, topicB.id, '2026-01-01T00:00:00.000Z');

    renderWithProviders(<ErrorNotebookPage />);
    await screen.findByText(questionA.stem);
    expect(screen.getByText(questionB.stem)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por tema'), { target: { value: topicA.id } });
    expect(screen.getByText(questionA.stem)).toBeInTheDocument();
    expect(screen.queryByText(questionB.stem)).not.toBeInTheDocument();
  });

  it('el buscador filtra por texto del enunciado', async () => {
    const topics = getTopics();
    const topicA = topics[0]!;
    const topicB = topics.find((t) => t.id !== topicA.id);
    if (!topicB) throw new Error('El banco de temas necesita al menos 2 temas para este test');
    const questionA = getQuestionsByTopic(topicA.id)[0]!;
    const questionB = getQuestionsByTopic(topicB.id)[0]!;

    await fail('sa', questionA.id, topicA.id, '2026-01-01T00:00:00.000Z');
    await fail('sb', questionB.id, topicB.id, '2026-01-01T00:00:00.000Z');

    renderWithProviders(<ErrorNotebookPage />);
    await screen.findByText(questionA.stem);

    // El enunciado COMPLETO es un término de búsqueda que, por construcción,
    // no puede aparecer también en el de otra pregunta — a diferencia de un
    // prefijo corto, que en preguntas de examen reales puede coincidir por
    // pura fórmula de redacción ("Según el artículo…", "De acuerdo con…").
    fireEvent.change(screen.getByPlaceholderText(/buscar por texto/i), { target: { value: questionA.stem } });
    expect(screen.getByText(questionA.stem)).toBeInTheDocument();
    expect(screen.queryByText(questionB.stem)).not.toBeInTheDocument();
  });
});
