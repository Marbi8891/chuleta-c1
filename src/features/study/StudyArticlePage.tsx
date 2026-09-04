// src/features/study/StudyArticlePage.tsx
//
// Migración de paintStudyArticle() / applyStudyFs() / updateStudyFsUI() /
// startSingleTemaQuiz() (legacy/index.original.html líneas 568-653).
//
// Diferencias deliberadas frente a legacy, exigidas por la Fase 2:
//  - El markdown se renderiza con react-markdown + remark-gfm (no marked.js
//    por CDN), para poder tratar tablas GFM correctamente sin cargar una
//    librería externa en runtime.
//  - La identidad de la pregunta al arrancar el test de un solo tema es
//    QuestionId (QuestionRef.id), nunca el índice del array.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { getQuestionsByTopic, getTopicById } from '../../data/index';
import { BLOQUES, getTemasOrdered } from '../../data/topics';
import { markTopicStudied, getStudyFsIndex, getStudyFsSteps, setStudyFsIndex } from '../../db/topicProgress';
import { useScope } from '../../app/ScopeContext';
import { shuffle, useQuiz } from '../../app/QuizContext';

/** Quita la primera línea "# Resumen ..." o "# Tema ..." — igual que en
 * paintStudyArticle: `s.markdown.replace(/^#\s+Resumen[^\n]*\n/, "").replace(/^#\s+Tema[^\n]*\n/, "")`,
 * porque el título ya se pinta aparte (s.title). */
function stripLeadingHeading(markdown: string): string {
  return markdown.replace(/^#\s+Resumen[^\n]*\n/, '').replace(/^#\s+Tema[^\n]*\n/, '');
}

const markdownComponents: Components = {
  table: ({ children }) => (
    <div className="study-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

export function StudyArticlePage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { setScopeToSingle } = useScope();
  const { startQuiz } = useQuiz();
  const [fsIndex, setFsIndex] = useState(1); // valor por defecto (18px, STUDY_FS_DEFAULT_INDEX) hasta que cargue el real de Dexie

  const topic = topicId ? getTopicById(topicId) : undefined;
  const temas = getTemasOrdered();
  const idx = topic ? temas.findIndex((t) => t.id === topic.id) : -1;
  const prev = idx > 0 ? temas[idx - 1] : null;
  const next = idx >= 0 && idx < temas.length - 1 ? temas[idx + 1] : null;

  useEffect(() => {
    getStudyFsIndex().then(setFsIndex);
  }, []);

  useEffect(() => {
    if (topic) void markTopicStudied(topic.id);
    window.scrollTo({ top: 0 });
  }, [topic]);

  const fsSteps = getStudyFsSteps();

  function decreaseFs() {
    setStudyFsIndex(fsIndex - 1)
      .then(() => getStudyFsIndex())
      .then(setFsIndex);
  }
  function increaseFs() {
    setStudyFsIndex(fsIndex + 1)
      .then(() => getStudyFsIndex())
      .then(setFsIndex);
  }

  if (!topic) {
    return (
      <div className="placeholder-view">
        <h2>Tema no encontrado</h2>
        <p>
          <Link to="/study">Volver a todos los temas</Link>
        </p>
      </div>
    );
  }

  const bloqueLabel = BLOQUES.find((b) => b.id === topic.bloque)?.label ?? `Bloque ${topic.bloque}`;
  const testQuestionCount = getQuestionsByTopic(topic.id).length;

  function handleStartTest() {
    if (!topic) return;
    setScopeToSingle(topic.id);
    const pool = shuffle(getQuestionsByTopic(topic.id).slice());
    startQuiz(pool, [topic.id]);
    navigate('/quiz/run');
  }

  return (
    <div className="study-article-wrap">
      <Link className="study-back" to="/study">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Todos los temas
      </Link>

      <div className="study-article-head">
        <span className="study-article-eyebrow">
          {bloqueLabel} · {topic.tema}
        </span>
        <div className="study-fs-controls" role="group" aria-label="Tamaño de letra">
          <button
            type="button"
            className="fs-dec"
            title="Reducir letra"
            aria-label="Reducir letra"
            disabled={fsIndex === 0}
            onClick={decreaseFs}
          >
            A
          </button>
          <span className="fs-label">{fsSteps[fsIndex]}px</span>
          <button
            type="button"
            className="fs-inc"
            title="Aumentar letra"
            aria-label="Aumentar letra"
            disabled={fsIndex === fsSteps.length - 1}
            onClick={increaseFs}
          >
            A
          </button>
        </div>
      </div>

      <div className="study-article" style={{ fontSize: `${fsSteps[fsIndex]}px` }}>
        <h1>{topic.title}</h1>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {stripLeadingHeading(topic.markdown)}
        </ReactMarkdown>
      </div>

      <div className="study-cta">
        <div className="sc-text">
          <h3>¿Listo para ponerte a prueba?</h3>
          <p>Test de {testQuestionCount} preguntas estilo oposición sobre este tema</p>
        </div>
        <button type="button" className="btn-primary" onClick={handleStartTest}>
          Hacer el test →
        </button>
      </div>

      <div className="study-nav-row">
        {prev ? (
          <Link className="btn-ghost" to={`/study/${prev.id}`}>
            ← {prev.tema}
          </Link>
        ) : (
          <button type="button" className="btn-ghost" disabled />
        )}
        {next ? (
          <Link className="btn-ghost" to={`/study/${next.id}`}>
            {next.tema} →
          </Link>
        ) : (
          <button type="button" className="btn-ghost" disabled />
        )}
      </div>
    </div>
  );
}
