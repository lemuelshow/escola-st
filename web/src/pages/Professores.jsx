import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Campo, Estado, Modal, useApi, useForm, useToast } from '../components/ui.jsx';

export default function Professores() {
  const { data, erro, carregando, recarregar } = useApi('/professores');
  const [edit, setEdit] = useState(null);
  const [atrib, setAtrib] = useState(null);

  return (
    <>
      <div className="topo">
        <div><h1>Professores</h1><p>Cadastre o professor e atribua turmas/disciplinas. Ele só verá o que for atribuído.</p></div>
        <button className="btn" onClick={() => setEdit({})}>+ Novo professor</button>
      </div>
      <Estado carregando={carregando} erro={erro} vazio={data && !data.length && 'Nenhum professor cadastrado.'}>
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Nome</th><th>E-mail (login)</th><th>Turmas / disciplinas</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data?.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome}<br /><small>{p.telefone}</small></td>
                  <td>{p.email}</td>
                  <td>
                    {p.atribuicoes.length
                      ? p.atribuicoes.map((a, i) => <div key={i}><small><b>{a.turma}</b> — {a.disciplina}</small></div>)
                      : <small>Nenhuma</small>}
                  </td>
                  <td>{p.ativo ? <Badge cor="verde">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
                  <td className="acoes" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn pequeno" onClick={() => setAtrib(p)}>Turmas</button>
                    <button className="btn sec pequeno" onClick={() => setEdit(p)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Estado>
      {edit && <Form inicial={edit} onClose={() => setEdit(null)} onSalvo={() => { setEdit(null); recarregar(); }} />}
      {atrib && <Atribuicoes prof={atrib} onClose={() => setAtrib(null)} onSalvo={() => { setAtrib(null); recarregar(); }} />}
    </>
  );
}

function Form({ inicial, onClose, onSalvo }) {
  const [v, , bind] = useForm({ ...inicial, senha: '' });
  const toast = useToast();
  const salvar = async (e) => {
    e.preventDefault();
    try {
      if (v.id) await api.put(`/professores/${v.id}`, v); else await api.post('/professores', v);
      toast('Professor salvo');
      onSalvo();
    } catch (e) { toast(e.message, 'erro'); }
  };
  return (
    <Modal titulo={v.id ? 'Editar professor' : 'Novo professor'} onClose={onClose}>
      <form onSubmit={salvar}>
        <div className="form-grade">
          <Campo label="Nome completo" span={2}><input {...bind('nome')} required autoFocus /></Campo>
          <Campo label="E-mail (usado no login)"><input type="email" {...bind('email')} required /></Campo>
          <Campo label="Telefone"><input {...bind('telefone')} /></Campo>
          <Campo label={v.id ? 'Nova senha (deixe em branco p/ manter)' : 'Senha inicial'}>
            <input type="text" {...bind('senha')} required={!v.id} minLength={6} />
          </Campo>
          {v.id && (
            <Campo label="Situação">
              <select {...bind('ativo', 'num')}><option value={1}>Ativo</option><option value={0}>Inativo (sem acesso)</option></select>
            </Campo>
          )}
        </div>
        <div className="modal-rodape"><button type="button" className="btn sec" onClick={onClose}>Cancelar</button><button className="btn">Salvar</button></div>
      </form>
    </Modal>
  );
}

function Atribuicoes({ prof, onClose, onSalvo }) {
  const toast = useToast();
  const [turmas, setTurmas] = useState(null);
  const [sel, setSel] = useState(new Set());

  useEffect(() => {
    (async () => {
      const lista = (await api.get('/turmas')).filter((t) => t.ativo);
      const det = await Promise.all(lista.map((t) => api.get(`/turmas/${t.id}`)));
      setTurmas(det);
      const s = new Set();
      det.forEach((t) => t.disciplinas.forEach((d) => d.professor_id === prof.id && s.add(`${t.id}:${d.id}`)));
      setSel(s);
    })().catch((e) => toast(e.message, 'erro'));
  }, [prof.id, toast]);

  const alternar = (k) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const salvar = async () => {
    try {
      await api.put(`/professores/${prof.id}/atribuicoes`, [...sel].map((k) => {
        const [turma_id, disciplina_id] = k.split(':').map(Number);
        return { turma_id, disciplina_id };
      }));
      toast('Atribuições salvas');
      onSalvo();
    } catch (e) { toast(e.message, 'erro'); }
  };

  return (
    <Modal titulo={`Turmas de ${prof.nome}`} onClose={onClose} largo>
      <Estado carregando={!turmas} vazio={turmas && !turmas.length && 'Nenhuma turma ativa cadastrada.'}>
        <p style={{ marginTop: 0 }}><small>Marque as disciplinas que este professor leciona em cada turma. Se outra pessoa já leciona, ela será substituída.</small></p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {turmas?.map((t) => (
            <div key={t.id} className="cartao" style={{ marginBottom: 0, padding: 12 }}>
              <h3 style={{ marginBottom: 8 }}>{t.nome} <small>({t.ano_letivo})</small></h3>
              {t.disciplinas.map((d) => {
                const k = `${t.id}:${d.id}`;
                const outro = d.professor_id && d.professor_id !== prof.id;
                return (
                  <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: '.9rem' }}>
                    <input type="checkbox" checked={sel.has(k)} onChange={() => alternar(k)} />
                    <span>{d.nome}{outro && <small> — {d.professor}</small>}</span>
                  </label>
                );
              })}
              {!t.disciplinas.length && <small>Turma sem disciplinas</small>}
            </div>
          ))}
        </div>
        <div className="modal-rodape"><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" onClick={salvar}>Salvar atribuições</button></div>
      </Estado>
    </Modal>
  );
}
