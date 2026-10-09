import { useParams } from 'react-router-dom';
import { fmtData } from '../../api.js';
import { useApi } from '../../components/ui.jsx';
import { CabecalhoEscola, PrintShell, nota } from './comum.jsx';

export default function Boletim() {
  const { tipo, id } = useParams();
  const url = tipo === 'turma' ? `/documentos/boletins/turma/${id}` : `/documentos/boletim/${id}`;
  const { data, carregando, erro } = useApi(url);
  return (
    <PrintShell titulo="Boletim escolar" carregando={carregando} erro={erro} dica={data && `${data.boletins.length} boletim(ns)`}>
      {data?.boletins.map((b) => <Folha key={b.matricula.id} b={b} e={data.escola} />)}
    </PrintShell>
  );
}

function Folha({ b, e }) {
  const m = b.matricula, a = b.aluno;
  return (
    <div className="folha">
      <CabecalhoEscola e={e} />
      <h1>Boletim escolar — {m.ano_letivo}</h1>
      <div className="dados-aluno">
        <span style={{ gridColumn: 'span 3' }}><b>Aluno(a):</b> {a.nome}</span>
        <span><b>Matrícula:</b> {a.matricula}</span>
        <span><b>Turma:</b> {m.turma_nome}</span>
        <span><b>Série:</b> {m.serie}</span>
        <span><b>Turno:</b> {m.turno}</span>
        <span><b>Nº:</b> {m.numero ?? ''}</span>
        <span style={{ gridColumn: 'span 2' }}><b>Nascimento:</b> {fmtData(a.data_nascimento)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th rowSpan={2}>Componente curricular</th>
            {[1, 2, 3, 4].map((i) => <th key={i} colSpan={2}>{i}º bimestre</th>)}
            <th rowSpan={2}>Média anual</th><th rowSpan={2}>Rec. final</th><th rowSpan={2}>Média final</th>
            <th rowSpan={2}>Total faltas</th><th rowSpan={2}>Freq. %</th><th rowSpan={2}>Situação</th>
          </tr>
          <tr>{[1, 2, 3, 4].map((i) => [<th key={'n' + i}>Nota</th>, <th key={'f' + i}>Faltas</th>])}</tr>
        </thead>
        <tbody>
          {b.disciplinas.map((d) => (
            <tr key={d.disciplina_id}>
              <td>{d.disciplina}</td>
              {d.bimestres.map((x, i) => [
                <td key={'n' + i} className="c">{nota(x.media)}</td>,
                <td key={'f' + i} className="c">{x.aulas ? x.faltas : ''}</td>,
              ])}
              <td className="c">{nota(d.mediaAnual)}</td>
              <td className="c">{nota(d.recFinal)}</td>
              <td className="c"><b>{nota(d.mediaFinal)}</b></td>
              <td className="c">{d.faltas}</td>
              <td className="c">{d.frequencia != null ? nota(d.frequencia) : ''}</td>
              <td className="c">{d.situacao === 'Cursando' ? '' : d.situacao}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 10 }}>
        <b>Frequência global:</b> {b.frequencia != null ? `${nota(b.frequencia)}%` : '—'} ({b.totalFaltas} falta(s) em {b.totalAulas} aula(s)) ·{' '}
        <b>Situação:</b> {b.situacao}
      </p>
      <p style={{ fontSize: '8.5pt' }}>Média para aprovação: {nota(b.regras.media)} · Frequência mínima: {b.regras.frequenciaMinima}%</p>
      <div className="assinaturas">
        <div>{e.diretor_nome || ' '}<br />Direção</div>
        <div>&nbsp;<br />Responsável</div>
      </div>
    </div>
  );
}
