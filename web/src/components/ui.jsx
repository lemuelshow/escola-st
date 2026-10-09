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

/* ---------- Paginação (no cliente) ---------- */
export function usePaginacao(lista, reset = [], tamanhoInicial = 15) {
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(tamanhoInicial);
  const total = lista?.length || 0;
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  // volta para a 1ª página quando os filtros mudam
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPagina(1), reset);
  const atual = Math.min(pagina, paginas);
  const itens = lista ? lista.slice((atual - 1) * tamanho, atual * tamanho) : lista;
  const mudarTamanho = (n) => { setTamanho(n); setPagina(1); };
  return { itens, pagina: atual, paginas, total, tamanho, setPagina, setTamanho: mudarTamanho };
}

function faixaPaginas(atual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const p = new Set([1, total, atual - 1, atual, atual + 1]);
  const out = [];
  [...p].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b).forEach((n, i, arr) => {
    if (i && n - arr[i - 1] > 1) out.push('…' + n);
    out.push(n);
  });
  return out;
}

export function Paginacao({ pagina, paginas, total, tamanho, setPagina, setTamanho, opcoes = [10, 15, 25, 50] }) {
  if (!total) return null;
  const ini = (pagina - 1) * tamanho + 1;
  const fim = Math.min(total, pagina * tamanho);
  return (
    <div className="paginacao">
      <span className="paginacao-info">Mostrando <b>{ini}–{fim}</b> de <b>{total}</b></span>
      <label className="paginacao-tamanho">
        Por página
        <select value={tamanho} onChange={(e) => setTamanho(Number(e.target.value))}>
          {opcoes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {paginas > 1 && (
        <nav className="paginacao-botoes" aria-label="Paginação">
          <button type="button" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)} aria-label="Página anterior">‹</button>
          {faixaPaginas(pagina, paginas).map((n) => typeof n === 'string'
            ? <span key={n} className="paginacao-reticencias">…</span>
            : <button type="button" key={n} className={n === pagina ? 'ativa' : ''} aria-current={n === pagina ? 'page' : undefined} onClick={() => setPagina(n)}>{n}</button>)}
          <button type="button" disabled={pagina === paginas} onClick={() => setPagina(pagina + 1)} aria-label="Próxima página">›</button>
        </nav>
      )}
    </div>
  );
}
