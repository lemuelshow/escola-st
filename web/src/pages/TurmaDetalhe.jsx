import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, Estado, Modal, useApi, useToast } from '../components/ui.jsx';
import { TurmaForm } from './Turmas.jsx';

export const SITUACOES_MATRICULA = ['cursando', 'transferido', 'remanejado', 'desistente'];

export default function TurmaDetalhe() {
  const { id } = useParams();
  const { data: t, erro, carregando, recarregar } = useApi(`/turmas/${id}`);
  const [aba, setAba] = useState('alunos');
  const [editar, setEditar] = useState(false);
  const nav = useNavigate();
  const toast = useToast();

  const excluir = async () => {
    if (!confirm('Excluir esta turma?')) return;
    try { await api.del(`/turmas/${id}`); nav('/turmas'); } catch (e) { toast(e.message, 'erro'); }
  };

  return (
    <Estado carregando={carregando && !t} erro={erro}>
      {t && (
        <>
          <div className="topo">
            <div>
              <h1>{t.nome}</h1>
              <p>{t.serie} · {t.turno} · {t.ano_letivo} {t.nivel && `· ${t.nivel}`} {!t.ativo && <Badge>Inativa</Badge>}</p>
            </div>
            <div className="acoes">
              <a className="btn sec" href={`/imprimir/boletim/turma/${t.id}`} target="_blank" rel="noreferrer">Boletins da turma</a>
              <a className="btn sec" href={`/imprimir/ata/${t.id}`} target="_blank" rel="noreferrer">Ata de resultados</a>
              <button className="btn sec" onClick={() => setEditar(true)}>Editar</button>
              <button className="btn perigo" onClick={excluir}>Excluir</button>
            </div>
          </div>
          <div className="abas">
            <button className={aba === 'alunos' ? 'ativa' : ''} onClick={() => setAba('alunos')}>Alunos ({t.alunos.length})</button>
            <button className={aba === 'grade' ? 'ativa' : ''} onClick={() => setAba('grade')}>Disciplinas e professores ({t.disciplinas.length})</button>
          </div>
          {aba === 'alunos' ? <AlunosTurma t={t} recarregar={recarregar} /> : <Grade t={t} recarregar={recarregar} />}
          {editar && <TurmaForm inicial={t} onClose={() => setEditar(false)} onSalvo={() => { setEditar(false); recarregar(); }} />}
        </>
      )}
    </Estado>
  );
}

function AlunosTurma({ t, recarregar }) {
  const toast = useToast();
  const [adicionar, setAdicionar] = useState(false);

  const alterar = async (m, dados) => {
    try { await api.put(`/matriculas/${m.id}`, dados); recarregar(); } catch (e) { toast(e.message, 'erro'); }
  };
  const remover = async (m) => {
    if (!confirm(`Remover ${m.nome} da turma?`)) return;
    try { await api.del(`/matriculas/${m.id}`); recarregar(); } catch (e) { toast(e.message, 'erro'); }
  };
  const renumerar = async () => {
    if (!confirm('Renumerar a chamada em ordem alfabética?')) return;
    await api.post(`/turmas/${t.id}/renumerar`); recarregar();
  };

  return (
    <>
      <div className="acoes" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={() => setAdicionar(true)}>+ Matricular alunos</button>
        <button className="btn sec" onClick={renumerar}>Renumerar chamada (A–Z)</button>
      </div>
      <Estado vazio={!t.alunos.length && 'Nenhum aluno matriculado.'}>
        <div className="tabela-wrap">
          <table>
            <thead><tr><th className="num">Nº</th><th>Aluno</th><th>Matrícula</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {t.alunos.map((m) => (
                <tr key={m.id}>
                  <td className="num">
                    <input className="input-nota" type="number" defaultValue={m.numero ?? ''} onBlur={(e) => e.target.value != m.numero && alterar(m, { numero: e.target.value || null })} />
                  </td>
                  <td><Link to={`/alunos/${m.aluno_id}`}>{m.nome}</Link></td>
                  <td>{m.matricula}</td>
                  <td>
                    <select value={m.situacao} onChange={(e) => alterar(m, { situacao: e.target.value })} style={{ width: 'auto' }}>
                      {SITUACOES_MATRICULA.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </td>
                  <td className="acoes" style={{ justifyContent: 'flex-end' }}>
                    <a className="btn sec pequeno" href={`/imprimir/boletim/matricula/${m.id}`} target="_blank" rel="noreferrer">Boletim</a>
                    <button className="btn perigo pequeno" onClick={() => remover(m)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Estado>
      {adicionar && <Matricular turma={t} onClose={() => setAdicionar(false)} onSalvo={() => { setAdicionar(false); recarregar(); }} />}
    </>
  );
}

function Matricular({ turma, onClose, onSalvo }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(new Set());
  const { data } = useApi(`/alunos?q=${encodeURIComponent(q)}`);
  const toast = useToast();
  const ja = new Set(turma.alunos.map((a) => a.aluno_id));
  const salvar = async () => {
    try { await api.post(`/turmas/${turma.id}/alunos`, { aluno_ids: [...sel] }); toast(`${sel.size} aluno(s) matriculado(s)`); onSalvo(); } catch (e) { toast(e.message, 'erro'); }
  };
  return (
    <Modal titulo={`Matricular em ${turma.nome}`} onClose={onClose} largo>
      <input type="search" placeholder="Buscar aluno por nome, matrícula ou CPF…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="tabela-wrap" style={{ maxHeight: 380, overflowY: 'auto', marginTop: 10 }}>
        <table>
          <tbody>
            {data?.filter((a) => !ja.has(a.id)).map((a) => (
              <tr key={a.id} className="clicavel" onClick={() => setSel((s) => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}>
                <td style={{ width: 30 }}><input type="checkbox" readOnly checked={sel.has(a.id)} /></td>
                <td>{a.nome}</td><td>{a.matricula}</td><td><small>{a.turma || 'Sem turma'}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="modal-rodape">
        <button className="btn sec" onClick={onClose}>Cancelar</button>
        <button className="btn" disabled={!sel.size} onClick={salvar}>Matricular {sel.size || ''}</button>
      </div>
    </Modal>
  );
}

function Grade({ t, recarregar }) {
  const toast = useToast();
  const disciplinas = useApi('/disciplinas').data;
  const professores = useApi('/professores').data;
  const [grade, setGrade] = useState([]);
  useEffect(() => setGrade(t.disciplinas.map((d) => ({ disciplina_id: d.id, professor_id: d.professor_id || '' }))), [t]);

  const tem = (id) => grade.some((g) => g.disciplina_id === id);
  const alternar = (id) => setGrade((g) => (tem(id) ? g.filter((x) => x.disciplina_id !== id) : [...g, { disciplina_id: id, professor_id: '' }]));
  const setProf = (id, p) => setGrade((g) => g.map((x) => (x.disciplina_id === id ? { ...x, professor_id: p ? Number(p) : '' } : x)));
  const salvar = async () => {
    try { await api.put(`/turmas/${t.id}/disciplinas`, grade); toast('Grade salva'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
  };

  return (
    <Estado carregando={!disciplinas || !professores}>
      <div className="tabela-wrap">
        <table>
          <thead><tr><th style={{ width: 40 }}></th><th>Disciplina</th><th>Professor responsável</th></tr></thead>
          <tbody>
            {disciplinas?.map((d) => (
              <tr key={d.id}>
                <td><input type="checkbox" checked={tem(d.id)} onChange={() => alternar(d.id)} /></td>
                <td>{d.nome}</td>
                <td>
                  {tem(d.id) && (
                    <select value={grade.find((g) => g.disciplina_id === d.id)?.professor_id ?? ''} onChange={(e) => setProf(d.id, e.target.value)}>
                      <option value="">— sem professor —</option>
                      {professores?.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="acoes" style={{ marginTop: 12 }}><button className="btn" onClick={salvar}>Salvar grade</button></div>
    </Estado>
  );
}
