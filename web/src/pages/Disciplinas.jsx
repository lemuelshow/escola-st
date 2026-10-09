import { useState } from 'react';
import { api } from '../api.js';
import { Campo, Estado, Modal, Paginacao, useApi, useForm, usePaginacao, useToast } from '../components/ui.jsx';

export default function Disciplinas() {
  const { data, erro, carregando, recarregar } = useApi('/disciplinas');
  const [edit, setEdit] = useState(null);
  const toast = useToast();
  const pag = usePaginacao(data);

  const excluir = async (d) => {
    if (!confirm(`Excluir a disciplina ${d.nome}?`)) return;
    try { await api.del(`/disciplinas/${d.id}`); recarregar(); } catch (e) { toast(e.message, 'erro'); }
  };

  return (
    <>
      <div className="topo">
        <div><h1>Disciplinas</h1><p>Componentes curriculares usados nas turmas, boletins e históricos.</p></div>
        <button className="btn" onClick={() => setEdit({ carga_horaria: 80, ordem: (data?.length || 0) + 1 })}>+ Nova disciplina</button>
      </div>
      <Estado carregando={carregando} erro={erro} vazio={data && !data.length && 'Nenhuma disciplina cadastrada.'}>
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Ordem</th><th>Disciplina</th><th className="num">Carga horária anual</th><th></th></tr></thead>
            <tbody>
              {pag.itens?.map((d) => (
                <tr key={d.id}>
                  <td>{d.ordem}</td><td>{d.nome}</td><td className="num">{d.carga_horaria}h</td>
                  <td className="acoes" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn sec pequeno" onClick={() => setEdit(d)}>Editar</button>
                    <button className="btn perigo pequeno" onClick={() => excluir(d)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacao {...pag} />
      </Estado>
      {edit && <Form inicial={edit} onClose={() => setEdit(null)} onSalvo={() => { setEdit(null); recarregar(); }} />}
    </>
  );
}

function Form({ inicial, onClose, onSalvo }) {
  const [v, , bind] = useForm(inicial);
  const toast = useToast();
  const salvar = async (e) => {
    e.preventDefault();
    try {
      if (v.id) await api.put(`/disciplinas/${v.id}`, v); else await api.post('/disciplinas', v);
      toast('Disciplina salva');
      onSalvo();
    } catch (e) { toast(e.message, 'erro'); }
  };
  return (
    <Modal titulo={v.id ? 'Editar disciplina' : 'Nova disciplina'} onClose={onClose}>
      <form onSubmit={salvar}>
        <div className="form-grade">
          <Campo label="Nome" span={2}><input {...bind('nome')} required autoFocus /></Campo>
          <Campo label="Carga horária anual (h)"><input type="number" min="0" {...bind('carga_horaria', 'num')} /></Campo>
          <Campo label="Ordem no boletim"><input type="number" {...bind('ordem', 'num')} /></Campo>
        </div>
        <div className="modal-rodape"><button type="button" className="btn sec" onClick={onClose}>Cancelar</button><button className="btn">Salvar</button></div>
      </form>
    </Modal>
  );
}
