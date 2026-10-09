import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, fmtData, fmtNota, hoje, qs } from '../api.js';
import { useUser } from '../App.jsx';
import { Badge, Campo, Estado, corSituacao, useApi, useToast } from '../components/ui.jsx';

export default function Diario() {
  const user = useUser();
  const [sp, setSp] = useSearchParams();
  const turmaId = sp.get('turma') || '';
  const discId = sp.get('disc') || '';
  const aba = sp.get('aba') || 'chamada';
  const set = (k, v) => setSp((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); if (k === 'turma') n.delete('disc'); return n; }, { replace: true });

  const lista = useApi('/turmas').data;
  const detalhe = useApi(user.papel === 'gestor' && turmaId ? `/turmas/${turmaId}` : null).data;

  const turmas = useMemo(() => {
    if (!lista) return [];
    if (user.papel === 'gestor') return lista.filter((t) => t.ativo).map((t) => ({ id: t.id, nome: t.nome }));
    const m = new Map();
    lista.forEach((x) => m.set(x.turma_id, { id: x.turma_id, nome: x.turma }));
    return [...m.values()];
  }, [lista, user.papel]);

  const disciplinas = useMemo(() => {
    if (!turmaId) return [];
    if (user.papel === 'gestor') return (detalhe?.disciplinas || []).map((d) => ({ id: d.id, nome: d.nome }));
    return (lista || []).filter((x) => String(x.turma_id) === turmaId).map((x) => ({ id: x.disciplina_id, nome: x.disciplina }));
  }, [turmaId, detalhe, lista, user.papel]);

  // seleciona automaticamente quando só há uma opção
  useEffect(() => { if (!turmaId && turmas.length === 1) set('turma', String(turmas[0].id)); }, [turmas]); // eslint-disable-line
  useEffect(() => { if (turmaId && !discId && disciplinas.length === 1) set('disc', String(disciplinas[0].id)); }, [disciplinas]); // eslint-disable-line

  return (
    <>
      <div className="topo"><div><h1>Diário de classe</h1><p>Lançamento de frequência e notas.</p></div></div>
      <div className="filtros">
        <Campo label="Turma">
          <select value={turmaId} onChange={(e) => set('turma', e.target.value)}>
            <option value="">Selecione…</option>
            {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Campo>
        <Campo label="Disciplina">
          <select value={discId} onChange={(e) => set('disc', e.target.value)} disabled={!turmaId}>
            <option value="">Selecione…</option>
            {disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </Campo>
      </div>
      {lista && !turmas.length && <div className="vazio">Nenhuma turma disponível para você.</div>}
      {turmaId && discId && (
        <>
          <div className="abas">
            {[['chamada', 'Chamada'], ['notas', 'Notas'], ['aulas', 'Aulas lançadas']].map(([k, l]) => (
              <button key={k} className={aba === k ? 'ativa' : ''} onClick={() => set('aba', k)}>{l}</button>
            ))}
          </div>
          {aba === 'chamada' && <Chamada turmaId={turmaId} discId={discId} />}
          {aba === 'notas' && <Notas turmaId={turmaId} discId={discId} />}
          {aba === 'aulas' && <Aulas turmaId={turmaId} discId={discId} abrir={(d) => { set('aba', 'chamada'); sessionStorage.setItem('chamada-data', d); }} />}
        </>
      )}
    </>
  );
}

function Chamada({ turmaId, discId }) {
  const toast = useToast();
  const [data, setData] = useState(() => { const d = sessionStorage.getItem('chamada-data'); sessionStorage.removeItem('chamada-data'); return d || hoje(); });
  const { data: ch, carregando, erro } = useApi(`/diario/chamada${qs({ turma_id: turmaId, disciplina_id: discId, data })}`);
  const [alunos, setAlunos] = useState([]);
  const [aula, setAula] = useState({ bimestre: 1, quantidade: 1, conteudo: '' });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!ch) return;
    setAlunos(ch.alunos);
    setAula(ch.aula ? { bimestre: ch.aula.bimestre, quantidade: ch.aula.quantidade, conteudo: ch.aula.conteudo || '' } : { bimestre: ch.bimestre_atual, quantidade: 1, conteudo: '' });
  }, [ch]);

  const ativos = alunos.filter((a) => a.situacao === 'cursando');
  const alternar = (id) => setAlunos((l) => l.map((a) => (a.id === id ? { ...a, presente: !a.presente } : a)));
  const todos = (p) => setAlunos((l) => l.map((a) => (a.situacao === 'cursando' ? { ...a, presente: p } : a)));
  const pelaCatraca = () => setAlunos((l) => l.map((a) => (a.situacao === 'cursando' ? { ...a, presente: a.catraca } : a)));

  const salvar = async () => {
    setSalvando(true);
    try {
      await api.put('/diario/chamada', {
        turma_id: turmaId, disciplina_id: discId, data, ...aula,
        presencas: ativos.map((a) => ({ matricula_id: a.id, presente: a.presente })),
      });
      toast('Chamada salva');
    } catch (e) { toast(e.message, 'erro'); } finally { setSalvando(false); }
  };

  const faltas = ativos.filter((a) => !a.presente).length;
  const algumCatraca = ativos.some((a) => a.catraca);

  return (
    <>
      <div className="cartao">
        <div className="form-grade">
          <Campo label="Data da aula"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
          <Campo label="Bimestre">
            <select value={aula.bimestre} onChange={(e) => setAula({ ...aula, bimestre: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b}º bimestre</option>)}
            </select>
          </Campo>
          <Campo label="Nº de aulas (tempos)"><input type="number" min="1" max="10" value={aula.quantidade} onChange={(e) => setAula({ ...aula, quantidade: Number(e.target.value) })} /></Campo>
          <Campo label="Conteúdo ministrado" span={3}><textarea value={aula.conteudo} onChange={(e) => setAula({ ...aula, conteudo: e.target.value })} /></Campo>
        </div>
        {ch?.aula && <p style={{ marginBottom: 0 }}><Badge cor="azul">Chamada já lançada nesta data — editando</Badge></p>}
      </div>
      <Estado carregando={carregando && !ch} erro={erro} vazio={ch && !ativos.length && 'Nenhum aluno cursando nesta turma.'}>
        <div className="acoes" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
          <div className="acoes">
            <button className="btn sec pequeno" onClick={() => todos(true)}>Todos presentes</button>
            <button className="btn sec pequeno" onClick={() => todos(false)}>Todos ausentes</button>
            {algumCatraca && <button className="btn sec pequeno" onClick={pelaCatraca} title="Marca presente quem passou pela catraca na data">Usar registros da catraca</button>}
          </div>
          <small>Clique no aluno para alternar · {ativos.length - faltas} presentes · {faltas} faltas</small>
        </div>
        <div className="chamada-lista">
          {ativos.map((a) => (
            <div key={a.id} className={`chamada-item ${a.presente ? '' : 'falta'}`} onClick={() => alternar(a.id)}>
              <span className="n">{a.numero}</span>
              <span className="nome">{a.nome}</span>
              {a.catraca && <span title="Passou pela catraca">◉</span>}
              <span className="marca-pf">{a.presente ? 'P' : 'F'}</span>
            </div>
          ))}
        </div>
        <div className="acoes" style={{ marginTop: 16 }}>
          <button className="btn" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar chamada'}</button>
        </div>
      </Estado>
    </>
  );
}

function Notas({ turmaId, discId }) {
  const toast = useToast();
  const [bim, setBim] = useState(1);
  const { data, carregando, erro, recarregar } = useApi(`/diario/notas${qs({ turma_id: turmaId, disciplina_id: discId })}`);
  const [valores, setValores] = useState({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!data) return;
    const v = {};
    for (const a of data.alunos) {
      const n = a.notas[bim] || {};
      v[a.id] = { nota: n.nota != null ? fmtNota(n.nota) : '', recuperacao: n.recuperacao != null ? fmtNota(n.recuperacao) : '' };
    }
    setValores(v);
  }, [data, bim]);

  const media = data?.media ?? 6;
  const baixa = (x) => x !== '' && Number(String(x).replace(',', '.')) < media;
  const set = (id, k, val) => setValores((v) => ({ ...v, [id]: { ...v[id], [k]: val.replace(/[^\d,.]/g, '') } }));

  const salvar = async () => {
    setSalvando(true);
    try {
      await api.put('/diario/notas', {
        turma_id: turmaId, disciplina_id: discId, bimestre: bim,
        lancamentos: Object.entries(valores).map(([matricula_id, v]) => ({ matricula_id: Number(matricula_id), ...v })),
      });
      toast('Notas salvas');
      recarregar();
    } catch (e) { toast(e.message, 'erro'); } finally { setSalvando(false); }
  };

  // Enter desce para o próximo campo
  const onKey = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const inputs = [...document.querySelectorAll('.input-nota[data-col="' + e.target.dataset.col + '"]')];
    inputs[inputs.indexOf(e.target) + 1]?.focus();
  };

  const recFinal = bim === 5;
  return (
    <>
      <div className="filtros">
        <Campo label="Período">
          <select value={bim} onChange={(e) => setBim(Number(e.target.value))}>
            {[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b}º bimestre</option>)}
            <option value={5}>Recuperação final</option>
          </select>
        </Campo>
        <small style={{ paddingBottom: 10 }}>Média para aprovação: {fmtNota(media)} · notas de 0 a 10 · a recuperação substitui a nota do bimestre se for maior.</small>
      </div>
      <Estado carregando={carregando && !data} erro={erro} vazio={data && !data.alunos.length && 'Nenhum aluno na turma.'}>
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">Nº</th><th>Aluno</th>
                <th className="num">{recFinal ? 'Rec. final' : `Nota ${bim}º bim`}</th>
                {!recFinal && <th className="num">Recuperação</th>}
                <th className="num">Média parcial</th><th className="num">Média final</th><th className="num">Faltas</th><th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {data?.alunos.map((a) => {
                const v = valores[a.id] || {};
                const inativo = a.situacao !== 'cursando';
                return (
                  <tr key={a.id} style={inativo ? { opacity: 0.5 } : undefined}>
                    <td className="num">{a.numero}</td>
                    <td>{a.nome} {inativo && <Badge>{a.situacao}</Badge>}</td>
                    <td className="num"><input className={`input-nota ${baixa(v.nota) ? 'baixa' : ''}`} data-col="n" inputMode="decimal" value={v.nota ?? ''} disabled={inativo} onKeyDown={onKey} onChange={(e) => set(a.id, 'nota', e.target.value)} /></td>
                    {!recFinal && <td className="num"><input className="input-nota" data-col="r" inputMode="decimal" value={v.recuperacao ?? ''} disabled={inativo} onKeyDown={onKey} onChange={(e) => set(a.id, 'recuperacao', e.target.value)} /></td>}
                    <td className="num">{fmtNota(a.mediaParcial)}</td>
                    <td className="num"><b>{fmtNota(a.mediaFinal)}</b></td>
                    <td className="num">{a.faltas}</td>
                    <td><Badge cor={corSituacao(a.situacaoDisc)}>{a.situacaoDisc}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="acoes" style={{ marginTop: 14 }}>
          <button className="btn" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar notas'}</button>
        </div>
      </Estado>
    </>
  );
}

function Aulas({ turmaId, discId, abrir }) {
  const toast = useToast();
  const { data, carregando, erro, recarregar } = useApi(`/diario/aulas${qs({ turma_id: turmaId, disciplina_id: discId })}`);
  const excluir = async (a) => {
    if (!confirm(`Excluir a aula de ${fmtData(a.data)} e sua chamada?`)) return;
    try { await api.del(`/diario/aulas/${a.id}`); recarregar(); } catch (e) { toast(e.message, 'erro'); }
  };
  const total = data?.reduce((s, a) => s + a.quantidade, 0) || 0;
  return (
    <Estado carregando={carregando && !data} erro={erro} vazio={data && !data.length && 'Nenhuma aula lançada.'}>
      <p><small>{data?.length} dia(s) · {total} aula(s) dadas</small></p>
      <div className="tabela-wrap">
        <table>
          <thead><tr><th>Data</th><th className="num">Bim.</th><th className="num">Aulas</th><th>Conteúdo</th><th className="num">Ausentes</th><th>Professor</th><th></th></tr></thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id}>
                <td>{fmtData(a.data)}</td><td className="num">{a.bimestre}º</td><td className="num">{a.quantidade}</td>
                <td style={{ maxWidth: 360 }}>{a.conteudo}</td><td className="num">{a.ausentes}</td><td><small>{a.professor}</small></td>
                <td className="acoes" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn sec pequeno" onClick={() => abrir(a.data)}>Abrir</button>
                  <button className="btn perigo pequeno" onClick={() => excluir(a)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Estado>
  );
}
