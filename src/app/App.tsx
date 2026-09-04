import { BrowserRouter } from 'react-router-dom';
import { ScopeProvider } from './ScopeContext';
import { QuizProvider } from './QuizContext';
import { AppRouter } from './router';

// import.meta.env.BASE_URL es el `base` de vite.config.ts ("/" en local,
// "/chuleta-c1/" en el build de GitHub Pages — ver
// docs/adr/0005-github-pages-deployment.md). react-router-dom espera el
// prefijo SIN barra final ("/chuleta-c1", no "/chuleta-c1/"); en local
// (BASE_URL === "/") no hace falta basename en absoluto.
const BASE_URL = import.meta.env.BASE_URL;
const basename = BASE_URL === '/' ? undefined : BASE_URL.replace(/\/$/, '');

export function App() {
  return (
    <BrowserRouter basename={basename} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ScopeProvider>
        <QuizProvider>
          <AppRouter />
        </QuizProvider>
      </ScopeProvider>
    </BrowserRouter>
  );
}
