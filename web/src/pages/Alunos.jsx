import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fmtData, qs } from '../api.js';
import { Badge, Campo, Estado, Paginacao, useApi, usePaginacao } from '../components/ui.jsx';

export default function Alunos() {
  const [q, setQ] = useState('');
  const [turma, setTurma] = useState('');
  const [inativos, setInativos] = useState(false);
  const turmas = useApi('/turmas').data;
  const { data, erro, carregando } = useApi(`/alunos${qs({ q, turma_id: turma, ativo: inativos ? 'todos' : '' })}`);
  const nav = useNavigate();
  const pag = usePaginacao(data, [q, turma, inativos]);

  return (
    <>
      <div className="topo">
        <div><h1>Alunos</h1><p>{data ? `${data.length} aluno(s)` : ''}</p></div>
        <Link className="btn" to="/alunos/novo">+ Novo aluno</Link>
      </div>
      <div className="filtros">
        <Campo label="Buscar"><input type="search" placeholder="Nome, matrícula ou CPF" value={q} onChange={(e) => setQ(e.target.value)} /></Campo>
        <Campo label="Turma">
          <select value={turma} onChange={(e) => setTurma(e.target.value)}>
            <option value="">Todas</option>
            {turmas?.map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.ano_letivo})</option>)}
          </select>
        </Campo>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 8 }}>
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar inativos
        </label>
      </div>
      <Estado carregando={carregando && !data} erro={erro} vazio={data && !data.length && 'Nenhum aluno encontrado.'}>
        <div className="tabela-wrap">
          <table>
            <thead><tr><th></th><th>Nome</th><th>Matrícula</th><th>Nascimento</th><th>Turma</th><th>Responsável</th><th>Catraca</th></tr></thead>
            <tbody>
              {pag.itens?.map((a) => (
                <tr key={a.id} className="clicavel" onClick={() => nav(`/alunos/${a.id}`)}>
                  <td style={{ width: 46 }}>{a.foto ? <img className="foto-mini" src={`/api/alunos/${a.id}/foto`} alt="" loading="lazy" /> : <span className="foto-mini" style={{ display: 'inline-block' }} />}</td>
                  <td>{a.nome} {!a.ativo && <Badge>Inativo</Badge>}</td>
                  <td>{a.matricula}</td>
                  <td>{fmtData(a.data_nascimento)}</td>
                  <td>{a.turma || <small>—</small>}</td>
                  <td>{a.responsavel}<br /><small>{a.telefone}</small></td>
                  <td>
                    {a.bloqueado ? <Badge cor="vermelho">Bloqueado</Badge>
                      : a.catraca_erro ? <Badge cor="amarelo">Erro</Badge>
                      : a.catraca_sync ? <Badge cor="verde">Sincronizado</Badge>
                      : <Badge>Pendente</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacao {...pag} />
      </Estado>
    </>
  );
}
