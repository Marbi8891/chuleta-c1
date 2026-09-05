// src/features/errors/ErrorNotebookPage.tsx — Study Intelligence, Fase 2
// (CUADERNO DE ERRORES). Lista de solo lectura sobre `errorRecords` (ver
// src/db/errorRecords.ts): cada tarjeta resuelve el enunciado/tema contra
// el banco canónico por QuestionId (getQuestionById) — nunca se guarda ni
// se muestra un texto que no venga de ahí. La Fase 3 (ERROR-BASED QUIZZES)
// añadirá la acción de generar un test a partir de estos errores; esta
// fase es deliberadamente solo de consulta.

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { queryErrorRecords, ERROR_MASTERY_THRESHOLD } from '../../db/errorRecords';
import type { ErrorRecord, ErrorStatus } from '../../db/schema';
import { getQuestionById, getTopicById } from '../../data/index';

type StatusFilter = 'PENDING' | 'MASTERED' | 'ALL';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'PENDING', label: 'Pendientes' },
  { key: 'MASTERED', label: 'Dominadas' },
  { key: 'ALL', label: 'Todas' },
];

const STATUS_LABEL: Record<ErrorStatus, string> = {
  NEW: 'Nueva',
  LEARNING: 'Aprendiendo',
  REVIEWING: 'En repaso',
  MASTERED: 'Dominada',
};

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(date);
}

function matchesStatusFilter(record: ErrorRecord, filter: StatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'MASTERED') return record.status === 'MASTERED';
  return record.status !== 'MASTERED'; // PENDING: NEW | LEARNING | REVIEWING
}

export function ErrorNotebookPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [topicFilter, setTopicFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const records = useLiveQuery(() => queryErrorRecords(), []);

  const topicOptions = useMemo(() => {
    if (!records) return [];
    const ids = new Set(records.map((r) => r.topicId));
    return Array.from(ids).sort();
  }, [records]);

  const visible = useMemo(() => {
    if (!records) return undefined;
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      if (!matchesStatusFilter(record, statusFilter)) return false;
      if (topicFilter && record.topicId !== topicFilter) return false;
      if (term) {
        const question = getQuestionById(record.questionId);
        const haystack = `${question?.stem ?? ''} ${record.topicId}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [records, statusFilter, topicFilter, search]);

  return (
    <section className="more-view errors-view">
      <div className="more-heading">
        <div>
          <h2>Cuaderno de errores</h2>
          <p>Preguntas que has fallado alguna vez, con su progreso hasta dominarlas.</p>
        </div>
      </div>

      <div className="errors-filters">
        <div className="errors-status-tabs" role="tablist" aria-label="Filtrar por estado">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              role="tab"
              aria-selected={statusFilter === filter.key}
              className={'errors-status-tab' + (statusFilter === filter.key ? ' active' : '')}
              onClick={() => setStatusFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="errors-filters-row">
          <label className="errors-topic-filter">
            <span className="visually-hidden">Filtrar por tema</span>
            <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
              <option value="">Todos los temas</option>
              {topicOptions.map((topicId) => (
                <option key={topicId} value={topicId}>
                  {topicId} · {getTopicById(topicId)?.title ?? topicId}
                </option>
              ))}
            </select>
          </label>

          <label className="errors-search">
            <span className="visually-hidden">Buscar en el cuaderno de errores</span>
            <input
              type="search"
              placeholder="Buscar por texto de la pregunta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      </div>

      {visible === undefined ? (
        <p className="history-state">Cargando cuaderno de errores…</p>
      ) : visible.length === 0 ? (
        <div className="empty-note">
          {records && records.length > 0
            ? 'Ningún error coincide con los filtros actuales.'
            : 'Todavía no has fallado ninguna pregunta. Cuando falles una en un test, aparecerá aquí para que puedas repasarla.'}
        </div>
      ) : (
        <div className="errors-list">
          {visible.map((record) => (
            <ErrorCard key={record.questionId} record={record} />
          ))}
        </div>
      )}
    </section>
  );
}

function ErrorCard({ record }: { record: ErrorRecord }) {
  const question = getQuestionById(record.questionId);
  const topic = getTopicById(record.topicId);

  return (
    <article className={`errors-card errors-card-${record.status.toLowerCase()}`}>
      <div className="errors-card-topline">
        <span className="tema-badge" title={topic?.title}>
          {record.topicId}
        </span>
        <span className={`errors-status-pill errors-status-pill-${record.status.toLowerCase()}`}>
          {STATUS_LABEL[record.status]}
        </span>
      </div>

      <h3>{question?.stem ?? `Pregunta ${record.questionId} (contenido no disponible)`}</h3>

      <div className="errors-card-meta">
        <span>
          Fallada {record.failureCount} {record.failureCount === 1 ? 'vez' : 'veces'}
        </span>
        <span>Primer fallo: {formatDate(record.firstFailedAt)}</span>
        <span>Último fallo: {formatDate(record.lastFailedAt)}</span>
        {record.lastReviewedAt && <span>Último acierto: {formatDate(record.lastReviewedAt)}</span>}
      </div>

      {record.status !== 'MASTERED' && (
        <div
          className="errors-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={ERROR_MASTERY_THRESHOLD}
          aria-valuenow={record.correctCountAfterFailure}
          aria-label={`${record.correctCountAfterFailure} de ${ERROR_MASTERY_THRESHOLD} aciertos consecutivos para dominarla`}
        >
          <div className="errors-progress-fill" style={{ width: `${(record.masteryScore * 100).toFixed(0)}%` }} />
        </div>
      )}
    </article>
  );
}
