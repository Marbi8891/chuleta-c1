import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="placeholder-view">
      <h2>Página no encontrada</h2>
      <p>
        No existe esa ruta. <Link to="/">Volver a Hoy</Link>.
      </p>
    </div>
  );
}
