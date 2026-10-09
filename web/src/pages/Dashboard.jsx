import { Link } from 'react-router-dom';
import { useUser } from '../App.jsx';
import { Estado, useApi } from '../components/ui.jsx';
import { fmtData } from '../api.js';

export default function Dashboard() {
  const user = useUser();
  const { data, erro, carregando } = useApi('/dashboard');

  return (
    <>
      <div className="topo">
        <div><h1>Olá, {user.nome.split(' ')[0]}</h1><p>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
      </div>
      <Estado carregando={carregando} erro={erro}>
        {data && (user.papel === 'gestor' ? <PainelGestor d={data} /> : <PainelProfessor d={data} />)}
      </Estado>
    </>
  );
}

function PainelGestor({ d }) {
  const kpis = [
    ['Alunos ativos', d.alunos, '/alunos'],
    ['Turmas', d.turmas, '/turmas'],
    ['Professores', d.professores, '/professores'],
    ['Entraram hoje (catraca)', d.entradasHoje, '/catraca'],
    ['Aulas lançadas hoje', d.aulasHoje, '/diario'],
    ['Alunos sem turma', d.semTurma, '/alunos'],
  ];
  return (
    <>
      <div className="grade-cartoes">
        {kpis.map(([r, v, to]) => (
          <Link key={r} to={to} className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="valor">{v}</div><div className="rotulo">{r}</div>
          </Link>
        ))}
      </div>
      <div className="cartao">
        <h2>Disciplinas sem professor</h2>
        {d.semProfessor.length ? (
          <ul className="lista-simples">
            {d.semProfessor.map((x, i) => <li key={i}><span>{x.turma}</span><small>{x.disciplina}</small></li>)}
          </ul>
        ) : <small>Todas as disciplinas das turmas ativas têm professor atribuído.</small>}
      </div>
    </>
  );
}

function PainelProfessor({ d }) {
  if (!d.turmas.length) return <div className="vazio">Nenhuma turma atribuída a você ainda. Fale com a gestão.</div>;
  return (
    <div className="grade-cartoes" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {d.turmas.map((t) => (
        <div key={`${t.turma_id}-${t.disciplina_id}`} className="kpi">
          <h3>{t.turma}</h3>
          <div className="rotulo">{t.disciplina} · {t.alunos} alunos · {t.turno || ''}</div>
          <div className="rotulo" style={{ margin: '6px 0 10px' }}>Última aula: {t.ultima_aula ? fmtData(t.ultima_aula) : '—'}</div>
          <div className="acoes">
            <Link className="btn pequeno" to={`/diario?turma=${t.turma_id}&disc=${t.disciplina_id}&aba=chamada`}>Chamada</Link>
            <Link className="btn sec pequeno" to={`/diario?turma=${t.turma_id}&disc=${t.disciplina_id}&aba=notas`}>Notas</Link>
          </div>
        </div>
      ))}
    </div>
  );
}
