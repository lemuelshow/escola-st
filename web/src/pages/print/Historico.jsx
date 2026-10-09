import { useParams } from 'react-router-dom';
import { fmtData } from '../../api.js';
import { useApi } from '../../components/ui.jsx';
import { Assinaturas, CabecalhoEscola, LocalData, PrintShell, nota } from './comum.jsx';

export default function Historico() {
  const { id } = useParams();
  const { data, carregando, erro } = useApi(`/documentos/historico/${id}`);
  if (!data) return <PrintShell titulo="Histórico escolar" carregando={carregando} erro={erro} />;

  const { escola: e, aluno: a, anos } = data;
  const nomes = [];
  anos.forEach((ano) => ano.disciplinas.forEach((d) => !nomes.includes(d.nome) && nomes.push(d.nome)));
  const celula = (ano, nome) => ano.disciplinas.find((d) => d.nome === nome);

  return (
    <PrintShell titulo="Histórico escolar" dica="observações podem ser editadas antes de imprimir">
      <div className="folha">
        <CabecalhoEscola e={e} />
        <h1>Histórico escolar</h1>
        <div className="dados-aluno">
          <span style={{ gridColumn: 'span 3' }}><b>Aluno(a):</b> {a.nome}</span>
          <span><b>Matrícula:</b> {a.matricula}</span>
          <span><b>Nascimento:</b> {fmtData(a.data_nascimento)}</span>
          <span><b>Sexo:</b> {a.sexo}</span>
          <span><b>Naturalidade:</b> {[a.naturalidade, a.uf_naturalidade].filter(Boolean).join('/')}</span>
          <span><b>Nacionalidade:</b> {a.nacionalidade}</span>
          <span><b>RG:</b> {a.rg}</span>
          <span><b>CPF:</b> {a.cpf}</span>
          <span style={{ gridColumn: 'span 2' }} />
          <span style={{ gridColumn: 'span 2' }}><b>Mãe:</b> {a.nome_mae}</span>
          <span style={{ gridColumn: 'span 2' }}><b>Pai:</b> {a.nome_pai}</span>
        </div>

        {anos.length ? (
          <>
            <table>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ textAlign: 'left' }}>Componente curricular</th>
                  {anos.map((x) => <th key={x.ano_letivo + x.serie} colSpan={2}>{x.serie}<br />{x.ano_letivo}</th>)}
                </tr>
                <tr>{anos.map((x) => [<th key={'n' + x.ano_letivo + x.serie}>Nota</th>, <th key={'c' + x.ano_letivo + x.serie}>C.H.</th>])}</tr>
              </thead>
              <tbody>
                {nomes.map((n) => (
                  <tr key={n}>
                    <td>{n}</td>
                    {anos.map((x) => {
                      const c = celula(x, n);
                      return [<td key={'n' + x.ano_letivo + x.serie} className="c">{nota(c?.nota)}</td>, <td key={'c' + x.ano_letivo + x.serie} className="c">{c?.carga_horaria ?? ''}</td>];
                    })}
                  </tr>
                ))}
                <tr>
                  <td><b>Carga horária total</b></td>
                  {anos.map((x) => <td key={x.ano_letivo + x.serie} colSpan={2} className="c">{x.disciplinas.reduce((s, d) => s + (Number(d.carga_horaria) || 0), 0)}h</td>)}
                </tr>
                <tr>
                  <td><b>Resultado</b></td>
                  {anos.map((x) => <td key={x.ano_letivo + x.serie} colSpan={2} className="c">{x.resultado}</td>)}
                </tr>
              </tbody>
            </table>
            <h3 style={{ marginTop: 14, fontSize: '10pt' }}>Estabelecimentos de ensino</h3>
            <table>
              <thead><tr><th>Ano</th><th>Série</th><th style={{ textAlign: 'left' }}>Escola</th><th>Cidade/UF</th></tr></thead>
              <tbody>
                {anos.map((x) => (
                  <tr key={x.ano_letivo + x.serie}><td className="c">{x.ano_letivo}</td><td className="c">{x.serie}</td><td>{x.escola}</td><td className="c">{x.cidade_uf}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <p>Nenhum ano letivo registrado para este aluno.</p>}

        <p style={{ marginTop: 14, fontSize: '9.5pt' }}><b>Observações:</b></p>
        <p contentEditable suppressContentEditableWarning style={{ minHeight: 40, border: '1px dashed #bbb', padding: 6, fontSize: '9.5pt', outline: 'none' }} />
        <LocalData e={e} />
        <Assinaturas e={e} />
      </div>
    </PrintShell>
  );
}
