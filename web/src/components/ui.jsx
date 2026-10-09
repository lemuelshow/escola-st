import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msgs, setMsgs] = useState([]);
  const show = useCallback((texto, tipo = 'ok') => {
    const id = Math.random();
    setMsgs((m) => [...m, { id, texto, tipo }]);
    setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), tipo === 'erro' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts">
        {msgs.map((m) => <div key={m.id} className={`toast ${m.tipo}`}>{m.texto}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Carregamento de dados ---------- */
export function useApi(url, deps = []) {
  const [data, setData] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const recarregar = useCallback(() => {
    if (!url) { setCarregando(false); return Promise.resolve(); }
    setCarregando(true);
    return api.get(url).then((d) => { setData(d); setErro(null); }).catch((e) => setErro(e.message)).finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => { recarregar(); }, [recarregar]);
  return { data, erro, carregando, recarregar, setData };
}

/* ---------- Modal ---------- */
export function Modal({ titulo, onClose, children, largo }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${largo ? 'largo' : ''}`}>
        <div className="modal-topo">
          <h3>{titulo}</h3>
          <button className="btn-icone" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ label, children, span }) {
  return (
    <label className="campo" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Estado({ carregando, erro, vazio, children }) {
  if (erro) return <div className="aviso erro">{erro}</div>;
  if (carregando) return <div className="carregando">Carregando…</div>;
  if (vazio) return <div className="vazio">{vazio}</div>;
  return children;
}

export function Badge({ cor = 'cinza', children }) {
  return <span className={`badge ${cor}`}>{children}</span>;
}

export const corSituacao = (s = '') => {
  s = s.toLowerCase();
  if (s.startsWith('aprovado') || s === 'cursando') return s === 'cursando' ? 'azul' : 'verde';
  if (s.startsWith('reprovado')) return 'vermelho';
  if (s.startsWith('recupera')) return 'amarelo';
  return 'cinza';
};

/** Formulário controlado simples */
export function useForm(inicial) {
  const [v, setV] = useState(inicial);
  const bind = (k, tipo) => ({
    value: v?.[k] ?? '',
    onChange: (e) => setV((o) => ({ ...o, [k]: tipo === 'num' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })),
  });
  return [v, setV, bind];
}
