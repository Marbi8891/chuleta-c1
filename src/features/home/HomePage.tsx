// src/features/home/HomePage.tsx
//
// "Hoy" — destino nuevo de la Fase 2, no existe en la app legacy (que
// arrancaba directamente en la portada de Estudiar). Es una landing mínima,
// sin contenido académico propio: solo enlaza a las tres features reales.

import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <div className="home-hero">
      <h2>Hoy</h2>
      <p>Elige por dónde seguir: repasa un tema, ponte a prueba con un test o repasa flashcards.</p>
      <div className="home-cards">
        <Link className="home-card" to="/study">
          <h3>Temario</h3>
          <p>Lee los resúmenes por bloque y tema.</p>
        </Link>
        <Link className="home-card" to="/quiz">
          <h3>Test</h3>
          <p>Preguntas estilo oposición del alcance que elijas.</p>
        </Link>
        <Link className="home-card" to="/flashcards">
          <h3>Repaso</h3>
          <p>Flashcards para memorizar lo esencial.</p>
        </Link>
      </div>
    </div>
  );
}
