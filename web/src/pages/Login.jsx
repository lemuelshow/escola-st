import { useState } from 'react';
import { api } from '../api.js';

const IconeOlho = ({ aberto }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {!aberto && <path d="M4 4l16 16" />}
  </svg>
);

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [dica, setDica] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      onLogin(await api.post('/auth/login', { email, senha }));
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <section className="login-midia">
        <video className="login-video" src="/login-bg.mp4" poster="/login-poster.jpg" autoPlay muted loop playsInline aria-hidden="true" />
        <img className="login-marca" src="/logo.png" alt="Centro Educacional Futuro" />
        <div className="login-card">
          <div className="login-card-topo">
            <span className="login-card-icone" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10L12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 2 9 2 12 0v-5" />
              </svg>
            </span>
            <div>
              <small>SECRETARIA DIGITAL</small>
              <strong>Toda a vida escolar em um só lugar</strong>
            </div>
          </div>
          <p>Matrículas, diário de classe, notas, frequência e documentos — organizados para gestores e professores.</p>
        </div>
      </section>

      <section className="login-painel">
        <form onSubmit={entrar}>
          <h1>Entrar</h1>
          <p className="login-sub">Entre com sua conta para continuar</p>
          {erro && <div className="aviso erro">{erro}</div>}
          <input type="email" placeholder="E-mail" aria-label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />
          <div className="login-senha">
            <input type={verSenha ? 'text' : 'password'} placeholder="Senha" aria-label="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
            <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}>
              <IconeOlho aberto={verSenha} />
            </button>
          </div>
          <button type="button" className="login-link" onClick={() => setDica((d) => !d)}>Esqueci minha senha</button>
          {dica && <div className="login-dica">Procure a secretaria ou o gestor da escola para redefinir sua senha.</div>}
          <button className="login-entrar" disabled={enviando}>
            {enviando ? 'ENTRANDO…' : <>ENTRAR <span aria-hidden="true">→</span></>}
          </button>
        </form>
      </section>
    </div>
  );
}
