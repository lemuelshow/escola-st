import { useParams } from 'react-router-dom';
import { dataExtenso } from '../../api.js';
import { useApi } from '../../components/ui.jsx';
import { Assinaturas, CabecalhoEscola, PrintShell, nota } from './comum.jsx';

export default function Ata() {
  const { id } = useParams();
  const { data, carregando, erro } = useApi(`/documentos/ata/${id}`);
  const e = data?.escola, t = data?.turma;
  return (
    <PrintShell titulo="Ata de resultados finais" carregando={carregando} erro={erro} dica="imprima em paisagem; o texto de abertura pode ser editado">
      {data && (
        <div className="folha paisagem">
          <CabecalhoEscola e={e} />
          <h1>Ata de resultados finais — {t.ano_letivo}</h1>
          <p className="texto-declaracao" contentEditable suppressContentEditableWarning style={{ margin: '10px 0', fontSize: '10pt', lineHeight: 1.5 }}>
            Aos {dataExtenso()}, encerrou-se o processo de avaliação dos alunos da turma {t.nome} ({t.serie}{t.nivel ? ` — ${t.nivel}` : ''}),
            turno {t.turno?.toLowerCase()}, do ano letivo de {t.ano_letivo}, desta unidade escolar, com os resultados abaixo discriminados.
          </p>
          <table>
            <thead>
              <tr>
                <th>Nº</th><th style={{ textAlign: 'left' }}>Nome do aluno</th>
                {data.disciplinas.map((d) => <th key={d.id}><div className="vertical">{d.nome}</div></th>)}
                <th><div className="vertical">Frequência %</div></th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {data.alunos.map((a, i) => (
                <tr key={i}>
                  <td className="c">{a.numero}</td>
                  <td>{a.nome}</td>
                  {data.disciplinas.map((d) => <td key={d.id} className="c">{nota(a.notas[d.id])}</td>)}
                  <td className="c">{a.frequencia != null ? nota(a.frequencia) : ''}</td>
                  <td className="c">{a.situacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '9pt' }}>
            <b>Resumo:</b> {Object.entries(data.resumo).map(([k, v]) => `${k}: ${v}`).join(' · ')} · Total: {data.alunos.length}
          </p>
          <p contentEditable suppressContentEditableWarning style={{ fontSize: '10pt', outline: 'none' }}>
            E, para constar, eu, {e.secretario_nome || '______________________'}, secretário(a), lavrei a presente ata, que vai assinada por mim e pela direção.
          </p>
          <Assinaturas e={e} />
        </div>
      )}
    </PrintShell>
  );
}
