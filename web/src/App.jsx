import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Alunos from './pages/Alunos.jsx';
import AlunoForm from './pages/AlunoForm.jsx';
import Turmas from './pages/Turmas.jsx';
import TurmaDetalhe from './pages/TurmaDetalhe.jsx';
import Disciplinas from './pages/Disciplinas.jsx';
import Professores from './pages/Professores.jsx';
import Diario from './pages/Diario.jsx';
import Documentos from './pages/Documentos.jsx';
import Catraca from './pages/Catraca.jsx';
import Configuracoes from './pages/Configuracoes.jsx';
import Boletim from './pages/print/Boletim.jsx';
import Ata from './pages/print/Ata.jsx';
import Historico from './pages/print/Historico.jsx';
import Declaracao from './pages/print/Declaracao.jsx';

const UserCtx = createContext(null);
export const useUser = () => useContext(UserCtx);

const MENU = [
  { to: '/', label: 'Painel', icone: '▦', papeis: ['gestor', 'professor'] },
  { to: '/diario', label: 'Diário de classe', icone: '✎', papeis: ['gestor', 'professor'] },
  { to: '/alunos', label: 'Alunos', icone: '☺', papeis: ['gestor'] },
  { to: '/turmas', label: 'Turmas', icone: '▤', papeis: ['gestor'] },
  { to: '/professores', label: 'Professores', icone: '✦', papeis: ['gestor'] },
  { to: '/disciplinas', label: 'Disciplinas', icone: '≡', papeis: ['gestor'] },
  { to: '/documentos', label: 'Documentos', icone: '⎙', papeis: ['gestor'] },
  { to: '/catraca', label: 'Catraca facial', icone: '◉', papeis: ['gestor'] },
  { to: '/configuracoes', label: 'Configurações', icone: '⚙', papeis: ['gestor', 'professor'] },
];

export default function App() {
  const [user, setUser] = useState(undefined);
  const [menuAberto, setMenuAberto] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    api.get('/auth/me').then(setUser).catch(() => setUser(null));
    const f = () => setUser(null);
    window.addEventListener('sessao-expirada', f);
    return () => window.removeEventListener('sessao-expirada', f);
  }, []);
  useEffect(() => setMenuAberto(false), [loc.pathname]);

  if (user === undefined) return <div className="carregando">Carregando…</div>;
  if (!user) return <Login onLogin={setUser} />;

  const gestor = user.papel === 'gestor';
  const sair = async () => { await api.post('/auth/logout'); setUser(null); nav('/'); };

  // páginas de impressão sem menu
  if (loc.pathname.startsWith('/imprimir/')) {
    return (
      <UserCtx.Provider value={user}>
        <Routes>
          <Route path="/imprimir/boletim/:tipo/:id" element={<Boletim />} />
          <Route path="/imprimir/ata/:id" element={<Ata />} />
          <Route path="/imprimir/historico/:id" element={<Historico />} />
          <Route path="/imprimir/declaracao/:tipo/:id" element={<Declaracao />} />
        </Routes>
      </UserCtx.Provider>
    );
  }

  return (
    <UserCtx.Provider value={user}>
      <div className="app">
        <aside className={`lateral ${menuAberto ? 'aberto' : ''}`}>
          <div className="marca">Gestão Escolar</div>
          <nav>
            {MENU.filter((m) => m.papeis.includes(user.papel)).map((m) => (
              <NavLink key={m.to} to={m.to} end={m.to === '/'}>
                <span className="ico">{m.icone}</span>{m.label}
              </NavLink>
            ))}
          </nav>
          <div className="usuario">
            <div><strong>{user.nome}</strong><small>{gestor ? 'Gestor' : 'Professor'}</small></div>
            <button className="btn sec pequeno" onClick={sair}>Sair</button>
          </div>
        </aside>
        {menuAberto && <div className="lateral-fundo" onClick={() => setMenuAberto(false)} />}
        <main className="conteudo">
          <button className="btn-menu" onClick={() => setMenuAberto(true)} aria-label="Menu">☰</button>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/diario" element={<Diario />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            {gestor && (
              <>
                <Route path="/alunos" element={<Alunos />} />
                <Route path="/alunos/:id" element={<AlunoForm />} />
                <Route path="/turmas" element={<Turmas />} />
                <Route path="/turmas/:id" element={<TurmaDetalhe />} />
                <Route path="/professores" element={<Professores />} />
                <Route path="/disciplinas" element={<Disciplinas />} />
                <Route path="/documentos" element={<Documentos />} />
                <Route path="/catraca" element={<Catraca />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </UserCtx.Provider>
  );
}
