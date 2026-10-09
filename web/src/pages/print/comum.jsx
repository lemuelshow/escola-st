import { useEffect } from 'react';
import { dataExtenso } from '../../api.js';
import { Estado } from '../../components/ui.jsx';

export function PrintShell({ titulo, carregando, erro, children, dica }) {
  useEffect(() => { document.title = titulo; }, [titulo]);
  return (
    <>
      <div className="print-barra">
        <span>{titulo} {dica && <span className="dica">· {dica}</span>}</span>
        <span className="acoes">
          <button className="btn" onClick={() => window.print()}>Imprimir / salvar PDF</button>
          <button className="btn sec" onClick={() => window.close()}>Fechar</button>
        </span>
      </div>
      <div className="folhas">
        <Estado carregando={carregando} erro={erro}>{children}</Estado>
      </div>
    </>
  );
}

export function CabecalhoEscola({ e }) {
  const linha2 = [e.escola_endereco, [e.escola_cidade, e.escola_uf].filter(Boolean).join('/'), e.escola_telefone && `Tel. ${e.escola_telefone}`].filter(Boolean).join(' — ');
  const linha3 = [e.escola_cnpj && `CNPJ ${e.escola_cnpj}`, e.escola_inep && `INEP ${e.escola_inep}`].filter(Boolean).join(' · ');
  return (
    <div className="cabecalho-escola">
      <div className="nome">{e.escola_nome}</div>
      {linha2 && <div>{linha2}</div>}
      {linha3 && <div>{linha3}</div>}
      {e.escola_ato && <div>{e.escola_ato}</div>}
    </div>
  );
}

export function LocalData({ e }) {
  return <p style={{ textAlign: 'right', marginTop: 30 }}>{e.escola_cidade ? `${e.escola_cidade}, ` : ''}{dataExtenso()}.</p>;
}

export function Assinaturas({ e }) {
  return (
    <div className="assinaturas">
      <div>{e.secretario_nome || ' '}<br />Secretário(a) escolar</div>
      <div>{e.diretor_nome || ' '}<br />Diretor(a)</div>
    </div>
  );
}

export const nota = (n) => (n == null || n === '' ? '' : typeof n === 'number' ? n.toFixed(1).replace('.', ',') : n);
