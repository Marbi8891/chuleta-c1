import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuiz } from '../../app/QuizContext';
import { getQuestionById, getTopicById } from '../../data/index';
import { getQuizSessionDetail, listQuizSessions } from '../../db/quiz';
import { queryErrorRecords } from '../../db/errorRecords';
import type { QuizAnswerRecord, QuizSessionRecord } from '../../db/schema';
import type { TemaId } from '../../types/content';
import type { AnswerKey, QuestionRef } from '../../types/quiz';

const ANSWER_INDEX: Record<AnswerKey, 0 | 1 | 2 | 3> = { a: 0, b: 1, c: 2, d: 3 };

function formatDate(value: string | undefined): string {
  if (!value) return 'Fecha desconocida';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getSessionPct(session: QuizSessionRecord): number | null {
  if (session.correctAnswers !== undefined && session.totalQuestions > 0) {
    return Math.round((session.correctAnswers / session.totalQuestions) * 100);
  }
  return session.legacyPct ?? null;
}

function getScoreText(session: QuizSessionRecord): string {
  if (session.correctAnswers !== undefined) {
    return `${session.correctAnswers}/${session.totalQuestions}`;
  }
  if (session.legacyPct !== undefined) return `${session.legacyPct}%`;
  return 'Resultado guardado';
}

function answerText(question: QuestionRef | undefined, answer: AnswerKey): string {
  if (!question) return answer.toUpperCase();
  return `${answer}) ${question.opts[ANSWER_INDEX[answer]]}`;
}

export function MorePage() {
  const sessions = useLiveQuery(() => listQuizSessions(), []);
  const pendingErrors = useLiveQuery(async () => {
    const all = await queryErrorRecords();
    return all.filter((record) => record.status !== 'MASTERED').length;
  }, []);

  return (
    <section className="more-view">
      <div className="more-heading">
        <div>
          <h2>Más</h2>
          <p>Consulta tu actividad guardada y vuelve a resultados anteriores.</p>
        </div>
      </div>

      <section className="history-section" aria-labelledby="quiz-history-heading">
        <div className="history-section-head">
          <div>
            <h3 id="quiz-history-heading">Historial de tests</h3>
            <p>Los tests completados se guardan en este dispositivo.</p>
          </div>
          {sessions && <span className="history-count">{sessions.length}</span>}
        </div>

        {sessions === undefined ? (
          <p className="history-state">Cargando historial…</p>
        ) : sessions.length === 0 ? (
          <p className="history-state">Todavía no has terminado ningún test.</p>
        ) : (
          <div className="history-list">
            {sessions.map((session) => {
              const pct = getSessionPct(session);
              return (
                <Link className="history-card" to={`/more/tests/${session.id}`} key={session.id}>
                  <div className="history-card-main">
                    <strong>{formatDate(session.completedAt ?? session.startedAt)}</strong>
                    <span>
                      {session.totalQuestions} pregunta{session.totalQuestions === 1 ? '' : 's'}
                      {session.scope?.length ? ` · ${session.scope.length} tema${session.scope.length === 1 ? '' : 's'}` : ''}
                    </span>
                  </div>
                  <div className="history-card-score">
                    <strong>{pct === null ? '—' : `${pct}%`}</strong>
                    <span>{getScoreText(session)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="more-secondary-grid" aria-label="Funciones adicionales">
        <Link className="more-secondary-card" to="/errors">
          <strong>Cuaderno de errores</strong>
          <span>
            {pendingErrors === undefined
              ? 'Cargando…'
              : pendingErrors === 0
                ? 'Ninguna pregunta pendiente de dominar.'
                : `${pendingErrors} pregunta${pendingErrors === 1 ? '' : 's'} pendiente${pendingErrors === 1 ? '' : 's'} de dominar.`}
          </span>
        </Link>
        <div className="more-secondary-card">
          <strong>Ajustes</strong>
          <span>Preferencias adicionales en una próxima iteración.</span>
        </div>
      </div>
    </section>
  );
}

export function QuizHistoryDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { startQuiz } = useQuiz();
  const detail = useLiveQuery(
    () => (sessionId ? getQuizSessionDetail(sessionId) : Promise.resolve(null)),
    [sessionId],
  );

  if (detail === undefined) {
    return <p className="history-state">Cargando resultado…</p>;
  }

  if (detail === null) {
    return (
      <section className="more-view">
        <Link className="history-back" to="/more">
          ← Volver a Más
        </Link>
        <div className="empty-note">No se ha encontrado ese test guardado.</div>
      </section>
    );
  }

  const { session, answers } = detail;
  const pct = getSessionPct(session);
  const wrongQuestions: QuestionRef[] = [];
  for (const answer of answers) {
    if (answer.correct) continue;
    const question = getQuestionById(answer.questionId);
    if (question) wrongQuestions.push(question);
  }

  function handleRetryWrong() {
    if (wrongQuestions.length === 0) return;
    const scope: TemaId[] = session.scope?.length
      ? [...session.scope]
      : Array.from(new Set(wrongQuestions.map((question) => question.topicId)));
    startQuiz(wrongQuestions.map((question) => ({ ...question })), scope);
    navigate('/quiz/run');
  }

  return (
    <section className="more-view history-detail">
      <Link className="history-back" to="/more">
        ← Historial de tests
      </Link>

      <div className="history-detail-header">
        <div>
          <h2>Resultado del test</h2>
          <p>{formatDate(session.completedAt ?? session.startedAt)}</p>
        </div>
        <div className="history-detail-score" aria-label={pct === null ? 'Resultado guardado' : `${pct}% de aciertos`}>
          <strong>{pct === null ? '—' : `${pct}%`}</strong>
          <span>{getScoreText(session)}</span>
        </div>
      </div>

      {session.scope?.length ? (
        <div className="history-scope" aria-label="Temas incluidos">
          {session.scope.map((topicId) => {
            const topic = getTopicById(topicId);
            return (
              <span key={topicId} title={topic?.title}>
                {topicId}
              </span>
            );
          })}
        </div>
      ) : null}

      {answers.length === 0 ? (
        <div className="history-state history-legacy-note">
          {session.migratedFromLegacy
            ? 'Este resultado procede del historial antiguo. Conservamos su puntuación, pero ese formato no guardaba las respuestas pregunta a pregunta.'
            : 'Este resultado no tiene respuestas individuales guardadas.'}
        </div>
      ) : (
        <div className="history-answer-list">
          {answers.map((answer, index) => (
            <HistoryAnswer key={answer.id ?? `${answer.sessionId}-${index}`} answer={answer} index={index} />
          ))}
        </div>
      )}

      <div className="history-detail-actions">
        {wrongQuestions.length > 0 && (
          <button type="button" className="btn-primary" onClick={handleRetryWrong}>
            Repetir fallos ({wrongQuestions.length})
          </button>
        )}
        <Link className="btn-ghost history-link-button" to="/quiz">
          Nuevo test
        </Link>
      </div>
    </section>
  );
}

function HistoryAnswer({ answer, index }: { answer: QuizAnswerRecord; index: number }) {
  const question = getQuestionById(answer.questionId);

  return (
    <article className={`history-answer ${answer.correct ? 'is-correct' : 'is-wrong'}`}>
      <div className="history-answer-topline">
        <span className="tema-badge">{question?.topicId ?? answer.questionId.split('-Q')[0]}</span>
        <span className="history-answer-result">{answer.correct ? 'Correcta' : 'Fallada'}</span>
      </div>
      <h3>
        {index + 1}. {question?.stem ?? `Pregunta ${answer.questionId}`}
      </h3>
      <p>
        <strong>Tu respuesta:</strong> {answerText(question, answer.selectedAnswer)}
      </p>
      {!answer.correct && question ? (
        <p className="history-correct-answer">
          <strong>Correcta:</strong> {answerText(question, question.answer)}
        </p>
      ) : null}
      {!question ? (
        <p className="history-question-missing">
          El contenido de esta pregunta ya no está disponible en el banco actual; se conserva tu respuesta histórica.
        </p>
      ) : null}
    </article>
  );
}
