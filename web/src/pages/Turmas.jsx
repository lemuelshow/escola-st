import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, Campo, Estado, Modal, Paginacao, useApi, useForm, usePaginacao, useToast } from '../components/ui.jsx';

export const TURNOS = ['Matutino', 'Vespertino', 'Noturno', 'Integral'];
export const NIVEIS = ['Educação Infantil', 'Ensino Fundamental - Anos Iniciais', 'Ensino Fundamental - Anos Finais', 'Ensino Médio', 'EJA'];

export default function Turmas() {
  const [ano, setAno] = useState('');
  const { data, erro, carregando, recarregar } = useApi(`/turmas${ano ? '?ano=' + ano : ''}`);
  const cfg = useApi('/config').data;
  const [nova, setNova] = useState(null);
  const nav = useNavigate();
  const pag = usePaginacao(data, [ano]);

  return (
    <>
      <div className="topo">
        <div><h1>Turmas</h1><p>Clique em uma turma para gerenciar alunos, disciplinas e professores.</p></div>
        <button className="btn" onClick={() => setNova({ ano_letivo: Number(cfg?.ano_letivo) || new Date().getFullYear(), turno: 'Matutino' })}>+ Nova turma</button>
      </div>
      <div className="filtros">
        <Campo label="Ano letivo"><input type="number" value={ano} onChange={(e) => setAno(e.target.value)} placeholder="Todos" /></Campo>
      </div>
      <Estado carregando={carregando} erro={erro} vazio={data && !data.length && 'Nenhuma turma cadastrada.'}>
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Turma</th><th>Série / ano</th><th>Turno</th><th>Ano letivo</th><th className="num">Alunos</th><th className="num">Disciplinas</th><th></th></tr></thead>
            <tbody>
              {pag.itens?.map((t) => (
                <tr key={t.id} className="clicavel" onClick={() => nav(`/turmas/${t.id}`)}>
                  <td><b>{t.nome}</b><br /><small>{t.nivel}</small></td>
                  <td>{t.serie}</td><td>{t.turno}</td><td>{t.ano_letivo}</td>
                  <td className="num">{t.alunos}</td><td className="num">{t.disciplinas}</td>
                  <td>{!t.ativo && <Badge>Inativa</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacao {...pag} />
      </Estado>
      {nova && <TurmaForm inicial={nova} onClose={() => setNova(null)} onSalvo={(id) => { setNova(null); recarregar(); if (id) nav(`/turmas/${id}`); }} />}
    </>
  );
}

export function TurmaForm({ inicial, onClose, onSalvo }) {
  const [v, , bind] = useForm(inicial);
  const toast = useToast();
  const salvar = async (e) => {
    e.preventDefault();
    try {
      if (v.id) { await api.put(`/turmas/${v.id}`, v); onSalvo(); } else { const r = await api.post('/turmas', v); onSalvo(r.id); }
      toast('Turma salva');
    } catch (e) { toast(e.message, 'erro'); }
  };
  return (
    <Modal titulo={v.id ? 'Editar turma' : 'Nova turma'} onClose={onClose}>
      <form onSubmit={salvar}>
        <div className="form-grade">
          <Campo label="Nome da turma (ex.: 6º Ano A)"><input {...bind('nome')} required autoFocus /></Campo>
          <Campo label="Série / ano (ex.: 6º Ano)"><input {...bind('serie')} required /></Campo>
          <Campo label="Nível de ensino">
            <select {...bind('nivel')}><option value="">—</option>{NIVEIS.map((n) => <option key={n}>{n}</option>)}</select>
          </Campo>
          <Campo label="Turno"><select {...bind('turno')}>{TURNOS.map((n) => <option key={n}>{n}</option>)}</select></Campo>
          <Campo label="Ano letivo"><input type="number" {...bind('ano_letivo', 'num')} required /></Campo>
          {v.id && <Campo label="Situação"><select {...bind('ativo', 'num')}><option value={1}>Ativa</option><option value={0}>Inativa</option></select></Campo>}
        </div>
        {!v.id && <p><small>A turma será criada com todas as disciplinas cadastradas; você pode ajustar depois.</small></p>}
        <div className="modal-rodape"><button type="button" className="btn sec" onClick={onClose}>Cancelar</button><button className="btn">Salvar</button></div>
      </form>
    </Modal>
  );
}
