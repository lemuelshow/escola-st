import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, hoje, qs } from '../api.js';
import { Badge, Campo, Estado, Modal, useApi, useForm, useToast } from '../components/ui.jsx';

const TIPOS = { entrada: ['Entrada', 'verde'], saida: ['Saída', 'azul'], negado: ['Negado', 'vermelho'], nao_identificado: ['Não identificado', 'amarelo'], outro: ['Outro', 'cinza'] };

export default function Catraca() {
  const [aba, setAba] = useState('painel');
  return (
    <>
      <div className="topo"><div><h1>Catraca facial</h1><p>Integração com equipamentos Control iD (iDFace / iDBlock).</p></div></div>
      <div className="abas">
        {[['painel', 'Painel e acessos'], ['alunos', 'Alunos no equipamento'], ['dispositivos', 'Equipamentos']].map(([k, l]) => (
          <button key={k} className={aba === k ? 'ativa' : ''} onClick={() => setAba(k)}>{l}</button>
        ))}
      </div>
      {aba === 'painel' && <Painel />}
      {aba === 'alunos' && <AlunosCatraca />}
      {aba === 'dispositivos' && <Dispositivos />}
    </>
  );
}

function Painel() {
  const toast = useToast();
  const [f, setF] = useState({ de: hoje(), ate: hoje(), tipo: '', turma_id: '' });
  const resumo = useApi('/catraca/resumo');
  const acessos = useApi(`/catraca/acessos${qs(f)}`);
  const turmas = useApi('/turmas').data;
  const [coletando, setColetando] = useState(false);

  // atualiza a tela periodicamente
  useEffect(() => {
    const t = setInterval(() => { resumo.recarregar(); acessos.recarregar(); }, 30000);
    return () => clearInterval(t);
  }, [resumo.recarregar, acessos.recarregar]); // eslint-disable-line

  const coletar = async () => {
    setColetando(true);
    try {
      const r = await api.post('/catraca/coletar');
      if (Array.isArray(r)) {
        const erros = r.filter((x) => x.erro);
        erros.length ? toast(erros.map((x) => `${x.dispositivo}: ${x.erro}`).join(' | '), 'erro')
          : toast(`${r.reduce((s, x) => s + x.novos, 0)} registro(s) novo(s)`);
      }
      resumo.recarregar(); acessos.recarregar();
    } catch (e) { toast(e.message, 'erro'); } finally { setColetando(false); }
  };

  const r = resumo.data;
  return (
    <>
      {r && (
        <>
          <div className="grade-cartoes">
            <div className="kpi"><div className="valor">{r.naEscola}</div><div className="rotulo">Na escola agora (última passagem = entrada)</div></div>
            <div className="kpi"><div className="valor">{r.sairam}</div><div className="rotulo">Já saíram hoje</div></div>
            <div className="kpi"><div className="valor">{r.negadosHoje}</div><div className="rotulo">Acessos negados hoje</div></div>
            <div className="kpi"><div className="valor">{r.pendentesSync}</div><div className="rotulo">Alunos não sincronizados</div></div>
            <div className="kpi"><div className="valor">{r.semFoto}</div><div className="rotulo">Alunos sem foto</div></div>
            <div className="kpi"><div className="valor">{r.bloqueados}</div><div className="rotulo">Bloqueados</div></div>
          </div>
          <div className="cartao" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {r.dispositivos.length ? r.dispositivos.map((d) => (
                <span key={d.id}><span className={`status-ponto ${d.status || ''}`} />{d.nome} <small>{d.ultima_comunicacao ? `· ${new Date(d.ultima_comunicacao).toLocaleTimeString('pt-BR')}` : ''}</small></span>
              )) : <small>Nenhum equipamento cadastrado — vá na aba “Equipamentos”.</small>}
            </div>
            <button className="btn" onClick={coletar} disabled={coletando}>{coletando ? 'Buscando…' : 'Buscar registros agora'}</button>
          </div>
        </>
      )}
      <div className="filtros">
        <Campo label="De"><input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></Campo>
        <Campo label="Até"><input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></Campo>
        <Campo label="Tipo">
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            <option value="">Todos</option>{Object.entries(TIPOS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Campo>
        <Campo label="Turma">
          <select value={f.turma_id} onChange={(e) => setF({ ...f, turma_id: e.target.value })}>
            <option value="">Todas</option>{turmas?.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Campo>
      </div>
      <Estado carregando={acessos.carregando && !acessos.data} erro={acessos.erro} vazio={acessos.data && !acessos.data.length && 'Nenhum registro no período.'}>
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Data/hora</th><th>Aluno</th><th>Tipo</th><th>Evento</th><th>Equipamento</th></tr></thead>
            <tbody>
              {acessos.data?.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.data_hora.replace(' ', 'T')).toLocaleString('pt-BR')}</td>
                  <td>{a.aluno_id ? <Link to={`/alunos/${a.aluno_id}`}>{a.aluno}</Link> : <small>—</small>}</td>
                  <td><Badge cor={TIPOS[a.tipo]?.[1]}>{TIPOS[a.tipo]?.[0] || a.tipo}</Badge></td>
                  <td><small>{a.descricao}</small></td>
                  <td><small>{a.dispositivo}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Estado>
    </>
  );
}

function AlunosCatraca() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [turma, setTurma] = useState('');
  const turmas = useApi('/turmas').data;
  const { data, carregando, erro, recarregar } = useApi(`/catraca/alunos${qs({ q, turma_id: turma })}`);
  const [ocupado, setOcupado] = useState(null);

  const sincronizar = async (corpo, rotulo) => {
    setOcupado(rotulo);
    try {
      const r = await api.post('/catraca/sincronizar', corpo);
      if (r.erros.length) toast(`${r.ok}/${r.total} enviados. Erro: ${r.erros[0].nome} — ${r.erros[0].erro}`, 'erro');
      else toast(`${r.ok} aluno(s) sincronizado(s)`);
    } catch (e) { toast(e.message, 'erro'); } finally { setOcupado(null); recarregar(); }
  };
  const bloqueio = async (a) => {
    setOcupado(a.id);
    try {
      const r = await api.post(`/catraca/alunos/${a.id}/bloqueio`, { bloqueado: !a.bloqueado });
      r.ok ? toast(r.bloqueado ? `${a.nome} bloqueado` : `${a.nome} liberado`) : toast(`Status salvo, mas: ${r.erro}`, 'erro');
    } catch (e) { toast(e.message, 'erro'); } finally { setOcupado(null); recarregar(); }
  };
  const remover = async (a) => {
    if (!confirm(`Remover ${a.nome} (cadastro e face) dos equipamentos?`)) return;
    setOcupado(a.id);
    try { const r = await api.post(`/catraca/alunos/${a.id}/remover`); r.ok ? toast('Removido dos equipamentos') : toast(r.erro, 'erro'); }
    finally { setOcupado(null); recarregar(); }
  };

  return (
    <>
      <div className="acoes" style={{ marginBottom: 14 }}>
        <button className="btn" disabled={!!ocupado} onClick={() => sincronizar({ pendentes: true }, 'pend')}>{ocupado === 'pend' ? 'Enviando…' : 'Enviar pendentes'}</button>
        <button className="btn sec" disabled={!!ocupado} onClick={() => confirm('Reenviar TODOS os alunos ativos (dados e foto)? Pode demorar.') && sincronizar({}, 'todos')}>{ocupado === 'todos' ? 'Enviando…' : 'Reenviar todos'}</button>
      </div>
      <div className="filtros">
        <Campo label="Buscar"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou matrícula" /></Campo>
        <Campo label="Turma">
          <select value={turma} onChange={(e) => setTurma(e.target.value)}>
            <option value="">Todas</option>{turmas?.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Campo>
      </div>
      <Estado carregando={carregando && !data} erro={erro} vazio={data && !data.length && 'Nenhum aluno.'}>
        <div className="tabela-wrap">
          <table>
            <thead><tr><th></th><th>Aluno</th><th>Turma</th><th>Foto</th><th>Sincronização</th><th>Hoje</th><th>Acesso</th><th></th></tr></thead>
            <tbody>
              {data?.map((a) => {
                const [tipo, hora] = (a.ultimo_hoje || '').split('|');
                return (
                  <tr key={a.id}>
                    <td style={{ width: 46 }}>{a.foto ? <img className="foto-mini" src={`/api/alunos/${a.id}/foto`} alt="" loading="lazy" /> : null}</td>
                    <td><Link to={`/alunos/${a.id}`}>{a.nome}</Link><br /><small>{a.matricula}</small></td>
                    <td>{a.turma}</td>
                    <td>{a.foto ? <Badge cor="verde">Sim</Badge> : <Badge cor="amarelo">Sem foto</Badge>}</td>
                    <td>
                      {a.catraca_erro ? <span title={a.catraca_erro}><Badge cor="vermelho">Erro</Badge> <small>{a.catraca_erro.slice(0, 60)}</small></span>
                        : a.catraca_sync ? <Badge cor="verde">OK</Badge> : <Badge>Pendente</Badge>}
                    </td>
                    <td>{tipo ? <><Badge cor={TIPOS[tipo][1]}>{TIPOS[tipo][0]}</Badge> <small>{hora.slice(11, 16)}</small></> : <small>—</small>}</td>
                    <td>{a.bloqueado ? <Badge cor="vermelho">Bloqueado</Badge> : <Badge cor="verde">Liberado</Badge>}</td>
                    <td className="acoes" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn sec pequeno" disabled={!!ocupado} onClick={() => sincronizar({ aluno_ids: [a.id] }, a.id)}>Enviar</button>
                      <button className={`btn pequeno ${a.bloqueado ? 'verde' : 'perigo'}`} disabled={!!ocupado} onClick={() => bloqueio(a)}>{a.bloqueado ? 'Liberar' : 'Bloquear'}</button>
                      <button className="btn perigo pequeno" disabled={!!ocupado} onClick={() => remover(a)} title="Remover do equipamento">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Estado>
    </>
  );
}

function Dispositivos() {
  const toast = useToast();
  const { data, carregando, erro, recarregar } = useApi('/catraca/dispositivos');
  const [edit, setEdit] = useState(null);

  const testar = async (d) => {
    try {
      const r = await api.post(`/catraca/dispositivos/${d.id}/testar`);
      toast(`Conectado! Serial ${r.info.serial || '—'} · firmware ${r.info.version || '—'}`);
    } catch (e) { toast(e.message, 'erro'); } finally { recarregar(); }
  };
  const excluir = async (d) => {
    if (!confirm(`Remover o equipamento ${d.nome} do sistema? (os registros já importados são mantidos)`)) return;
    await api.del(`/catraca/dispositivos/${d.id}`); recarregar();
  };
  const reiniciar = async (d) => {
    if (!confirm('Reimportar todos os registros que ainda estão na memória do equipamento? Registros já importados não duplicam.')) return;
    await api.post(`/catraca/dispositivos/${d.id}/reiniciar-leitura`); toast('Na próxima coleta os registros serão relidos'); recarregar();
  };

  return (
    <>
      <div className="acoes" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={() => setEdit({ porta: 80, usuario: 'admin', senha: '', sentido: 'portal', ativo: 1 })}>+ Novo equipamento</button>
      </div>
      <div className="aviso">
        O servidor precisa estar na mesma rede dos equipamentos. Use IP fixo no equipamento (Menu › Configurações › Rede).
        Cada aluno é cadastrado no equipamento com o mesmo ID do sistema e entra no grupo de acesso padrão (grupo 1).
      </div>
      <Estado carregando={carregando && !data} erro={erro} vazio={data && !data.length && 'Nenhum equipamento cadastrado.'}>
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Equipamento</th><th>Endereço</th><th>Sentido</th><th>Status</th><th className="num">Último log lido</th><th></th></tr></thead>
            <tbody>
              {data?.map((d) => (
                <tr key={d.id}>
                  <td>{d.nome} {!d.ativo && <Badge>Inativo</Badge>}</td>
                  <td>{d.ip}:{d.porta}</td>
                  <td>{{ entrada: 'Só entrada', saida: 'Só saída', portal: 'Pelo portal' }[d.sentido]}</td>
                  <td><span className={`status-ponto ${d.status || ''}`} />{d.status || 'não testado'}<br /><small>{d.ultima_comunicacao && new Date(d.ultima_comunicacao).toLocaleString('pt-BR')}</small></td>
                  <td className="num">{d.ultimo_log_id}</td>
                  <td className="acoes" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn pequeno" onClick={() => testar(d)}>Testar conexão</button>
                    <button className="btn sec pequeno" onClick={() => setEdit(d)}>Editar</button>
                    <button className="btn sec pequeno" onClick={() => reiniciar(d)}>Reler registros</button>
                    <button className="btn perigo pequeno" onClick={() => excluir(d)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Estado>
      {edit && <DispositivoForm inicial={edit} onClose={() => setEdit(null)} onSalvo={() => { setEdit(null); recarregar(); }} />}
    </>
  );
}

function DispositivoForm({ inicial, onClose, onSalvo }) {
  const [v, , bind] = useForm({ ...inicial, senha: '' });
  const toast = useToast();
  const salvar = async (e) => {
    e.preventDefault();
    try {
      if (v.id) await api.put(`/catraca/dispositivos/${v.id}`, v); else await api.post('/catraca/dispositivos', { ...v, senha: v.senha || 'admin' });
      toast('Equipamento salvo'); onSalvo();
    } catch (e) { toast(e.message, 'erro'); }
  };
  return (
    <Modal titulo={v.id ? 'Editar equipamento' : 'Novo equipamento Control iD'} onClose={onClose}>
      <form onSubmit={salvar}>
        <div className="form-grade">
          <Campo label="Nome (ex.: Catraca portão principal)" span={2}><input {...bind('nome')} required autoFocus /></Campo>
          <Campo label="IP"><input {...bind('ip')} required placeholder="192.168.0.129" /></Campo>
          <Campo label="Porta"><input type="number" {...bind('porta', 'num')} /></Campo>
          <Campo label="Usuário da interface web"><input {...bind('usuario')} /></Campo>
          <Campo label={v.id ? 'Senha (vazio = manter)' : 'Senha (padrão: admin)'}><input type="password" {...bind('senha')} /></Campo>
          <Campo label="Sentido dos acessos">
            <select {...bind('sentido')}>
              <option value="portal">Pelo portal (catraca bidirecional)</option>
              <option value="entrada">Equipamento só de entrada</option>
              <option value="saida">Equipamento só de saída</option>
            </select>
          </Campo>
          <Campo label="Situação"><select {...bind('ativo', 'num')}><option value={1}>Ativo</option><option value={0}>Inativo</option></select></Campo>
        </div>
        <div className="modal-rodape"><button type="button" className="btn sec" onClick={onClose}>Cancelar</button><button className="btn">Salvar</button></div>
      </form>
    </Modal>
  );
}
