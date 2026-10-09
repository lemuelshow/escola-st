import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, prepararFoto } from '../api.js';
import { Badge, Campo, Estado, Modal, useApi, useForm, useToast } from '../components/ui.jsx';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export default function AlunoForm() {
  const { id } = useParams();
  const novo = id === 'novo';
  const { data, erro, carregando, recarregar } = useApi(novo ? null : `/alunos/${id}`);
  const turmas = useApi('/turmas').data;
  const [v, setV, bind] = useForm({ nacionalidade: 'Brasileira', ativo: 1 });
  const [fotoVer, setFotoVer] = useState(Date.now());
  const toast = useToast();
  const nav = useNavigate();

  useEffect(() => { if (data) setV(data); }, [data, setV]);

  const salvar = async (e) => {
    e.preventDefault();
    try {
      if (novo) {
        const r = await api.post('/alunos', v);
        toast('Aluno cadastrado');
        nav(`/alunos/${r.id}`, { replace: true });
      } else {
        await api.put(`/alunos/${id}`, v);
        toast('Dados salvos');
        recarregar();
      }
    } catch (e) { toast(e.message, 'erro'); }
  };

  const inativar = async () => {
    if (!confirm('Inativar este aluno? Ele deixará de aparecer nas listas e será bloqueado na catraca na próxima sincronização.')) return;
    await api.del(`/alunos/${id}`);
    nav('/alunos');
  };

  return (
    <Estado carregando={!novo && carregando && !data} erro={erro}>
      <div className="topo">
        <div><h1>{novo ? 'Novo aluno' : v.nome}</h1><p>{!novo && `Matrícula ${v.matricula}`}</p></div>
        {!novo && (
          <div className="acoes">
            <a className="btn sec" href={`/imprimir/historico/${id}`} target="_blank" rel="noreferrer">Histórico escolar</a>
            <Link className="btn sec" to={`/documentos?aluno=${id}`}>Declarações</Link>
            {!!v.ativo && <button className="btn perigo" onClick={inativar}>Inativar</button>}
          </div>
        )}
      </div>

      <form onSubmit={salvar} className="cartao">
        <div className="foto-box">
          {!novo && <FotoAluno id={id} temFoto={!!data?.foto} versao={fotoVer} onNova={() => { setFotoVer(Date.now()); recarregar(); }} />}
          <div className="form-grade" style={{ flex: 1, minWidth: 260 }}>
            <Campo label="Nome completo" span={2}><input {...bind('nome')} required /></Campo>
            <Campo label="Matrícula (vazio = automática)"><input {...bind('matricula')} /></Campo>
            <Campo label="Data de nascimento"><input type="date" {...bind('data_nascimento')} /></Campo>
            <Campo label="Sexo"><select {...bind('sexo')}><option value="">—</option><option value="F">Feminino</option><option value="M">Masculino</option></select></Campo>
            <Campo label="CPF"><input {...bind('cpf')} /></Campo>
            <Campo label="RG"><input {...bind('rg')} /></Campo>
            <Campo label="Naturalidade (cidade)"><input {...bind('naturalidade')} /></Campo>
            <Campo label="UF"><select {...bind('uf_naturalidade')}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
            <Campo label="Nacionalidade"><input {...bind('nacionalidade')} /></Campo>
            <Campo label="Nome da mãe"><input {...bind('nome_mae')} /></Campo>
            <Campo label="Nome do pai"><input {...bind('nome_pai')} /></Campo>
            <Campo label="Responsável"><input {...bind('responsavel')} /></Campo>
            <Campo label="Telefone"><input {...bind('telefone')} /></Campo>
            <Campo label="E-mail"><input type="email" {...bind('email')} /></Campo>
            <Campo label="Endereço" span={2}><input {...bind('endereco')} /></Campo>
            {novo && (
              <Campo label="Matricular na turma">
                <select {...bind('turma_id')}><option value="">— depois —</option>{turmas?.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.ano_letivo})</option>)}</select>
              </Campo>
            )}
            {!novo && <Campo label="Situação"><select {...bind('ativo', 'num')}><option value={1}>Ativo</option><option value={0}>Inativo</option></select></Campo>}
            <Campo label="Observações" span={3}><textarea {...bind('observacoes')} /></Campo>
          </div>
        </div>
        <div className="modal-rodape"><button className="btn">{novo ? 'Cadastrar aluno' : 'Salvar alterações'}</button></div>
        {novo && <small>Depois de cadastrar você poderá enviar a foto (usada pela catraca facial).</small>}
      </form>

      {!novo && data && (
        <>
          <div className="cartao">
            <h2>Matrículas</h2>
            {data.matriculas.length ? (
              <ul className="lista-simples">
                {data.matriculas.map((m) => (
                  <li key={m.id}>
                    <span><Link to={`/turmas/${m.turma_id}`}>{m.turma}</Link> <small>· {m.ano_letivo} · nº {m.numero ?? '—'}</small></span>
                    <span className="acoes">
                      <Badge cor={m.situacao === 'cursando' ? 'azul' : 'cinza'}>{m.situacao}</Badge>
                      <a className="btn sec pequeno" href={`/imprimir/boletim/matricula/${m.id}`} target="_blank" rel="noreferrer">Boletim</a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <small>Aluno não está matriculado em nenhuma turma. Matricule pela tela da turma.</small>}
          </div>
          <HistoricoExterno aluno={data} recarregar={recarregar} />
          <div className="cartao">
            <h2>Catraca facial</h2>
            <p style={{ margin: 0 }}>
              {data.bloqueado ? <Badge cor="vermelho">Acesso bloqueado</Badge> : <Badge cor="verde">Acesso liberado</Badge>}{' '}
              {data.catraca_sync ? <small>Sincronizado em {new Date(data.catraca_sync).toLocaleString('pt-BR')}</small> : <small>Ainda não enviado ao equipamento.</small>}
            </p>
            {data.catraca_erro && <div className="aviso erro" style={{ marginTop: 10 }}>{data.catraca_erro}</div>}
            <AcoesCatraca aluno={data} recarregar={recarregar} />
          </div>
        </>
      )}
    </Estado>
  );
}

function AcoesCatraca({ aluno, recarregar }) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const exec = async (fn) => {
    setOcupado(true);
    try { await fn(); } catch (e) { toast(e.message, 'erro'); } finally { setOcupado(false); recarregar(); }
  };
  return (
    <div className="acoes" style={{ marginTop: 12 }}>
      <button className="btn" disabled={ocupado} onClick={() => exec(async () => {
        const r = await api.post('/catraca/sincronizar', { aluno_ids: [aluno.id] });
        r.ok ? toast('Aluno enviado ao(s) equipamento(s)') : toast(r.erros[0]?.erro || 'Falha ao sincronizar', 'erro');
      })}>Enviar para catraca</button>
      <button className={`btn ${aluno.bloqueado ? 'verde' : 'perigo'}`} disabled={ocupado} onClick={() => exec(async () => {
        const r = await api.post(`/catraca/alunos/${aluno.id}/bloqueio`, { bloqueado: !aluno.bloqueado });
        r.ok ? toast(r.bloqueado ? 'Acesso bloqueado' : 'Acesso liberado') : toast(r.erro, 'erro');
      })}>{aluno.bloqueado ? 'Liberar acesso' : 'Bloquear acesso'}</button>
    </div>
  );
}

function FotoAluno({ id, temFoto, versao, onNova }) {
  const toast = useToast();
  const arquivo = useRef();
  const [camera, setCamera] = useState(false);

  const enviar = async (fonte) => {
    try {
      const jpeg = await prepararFoto(fonte);
      await api.upload(`/alunos/${id}/foto`, jpeg);
      toast('Foto atualizada. Envie novamente para a catraca.');
      onNova();
    } catch (e) { toast(e.message || 'Falha ao processar a imagem', 'erro'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      {temFoto ? <img className="foto" src={`/api/alunos/${id}/foto?v=${versao}`} alt="Foto do aluno" /> : <div className="foto">Sem foto</div>}
      <div className="acoes">
        <button type="button" className="btn sec pequeno" onClick={() => arquivo.current.click()}>Arquivo</button>
        <button type="button" className="btn sec pequeno" onClick={() => setCamera(true)}>Câmera</button>
      </div>
      <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && enviar(e.target.files[0])} />
      {camera && <Camera onClose={() => setCamera(false)} onFoto={(video) => { enviar(video); setCamera(false); }} />}
    </div>
  );
}

function Camera({ onClose, onFoto }) {
  const video = useRef();
  const [erro, setErro] = useState('');
  useEffect(() => {
    let stream;
    navigator.mediaDevices?.getUserMedia({ video: { width: 1280, height: 720 } })
      .then((s) => { stream = s; video.current.srcObject = s; })
      .catch(() => setErro('Não foi possível acessar a câmera (o navegador só libera em localhost ou HTTPS).'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  return (
    <Modal titulo="Capturar foto" onClose={onClose}>
      {erro ? <div className="aviso erro">{erro}</div> : <video ref={video} className="camera" autoPlay playsInline muted />}
      <p><small>Rosto centralizado, de frente, bem iluminado, sem óculos escuros ou boné.</small></p>
      <div className="modal-rodape">
        <button className="btn sec" onClick={onClose}>Cancelar</button>
        <button className="btn" disabled={!!erro} onClick={() => onFoto(video.current)}>Capturar</button>
      </div>
    </Modal>
  );
}

function HistoricoExterno({ aluno, recarregar }) {
  const toast = useToast();
  const [novo, setNovo] = useState(false);
  const porAno = {};
  for (const h of aluno.historico_externo) (porAno[`${h.ano_letivo} — ${h.serie}`] ||= []).push(h);
  const excluir = async (h) => { await api.del(`/historico/${h.id}`); recarregar(); };
  return (
    <div className="cartao">
      <div className="topo" style={{ marginBottom: 8 }}>
        <div><h2 style={{ margin: 0 }}>Vida escolar anterior</h2><p><small>Anos cursados em outras escolas — entram no histórico escolar.</small></p></div>
        <button className="btn sec" onClick={() => setNovo(true)}>+ Lançar ano</button>
      </div>
      {Object.keys(porAno).length ? Object.entries(porAno).map(([k, linhas]) => (
        <div key={k} style={{ marginBottom: 10 }}>
          <b>{k}</b> <small>{linhas[0].escola} {linhas[0].cidade_uf} · {linhas[0].resultado}</small>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {linhas.map((h) => (
              <span key={h.id} className="badge cinza">{h.disciplina}: {h.nota} <button onClick={() => excluir(h)} style={{ border: 0, background: 'none', cursor: 'pointer' }} title="Remover">×</button></span>
            ))}
          </div>
        </div>
      )) : <small>Nenhum registro.</small>}
      {novo && <NovoAnoExterno aluno={aluno} onClose={() => setNovo(false)} onSalvo={() => { setNovo(false); recarregar(); toast('Registro salvo'); }} />}
    </div>
  );
}

function NovoAnoExterno({ aluno, onClose, onSalvo }) {
  const disciplinas = useApi('/disciplinas').data;
  const [cab, , bind] = useForm({ resultado: 'Aprovado' });
  const [notas, setNotas] = useState({});
  const toast = useToast();
  const salvar = async (e) => {
    e.preventDefault();
    const linhas = disciplinas.filter((d) => notas[d.id]?.nota).map((d) => ({
      ...cab, disciplina: d.nome, nota: notas[d.id].nota, carga_horaria: notas[d.id].ch || d.carga_horaria,
    }));
    if (!linhas.length) return toast('Informe ao menos uma nota', 'erro');
    try { await api.post(`/alunos/${aluno.id}/historico`, linhas); onSalvo(); } catch (e) { toast(e.message, 'erro'); }
  };
  return (
    <Modal titulo="Ano cursado em outra escola" onClose={onClose} largo>
      <form onSubmit={salvar}>
        <div className="form-grade">
          <Campo label="Ano letivo"><input type="number" {...bind('ano_letivo', 'num')} required /></Campo>
          <Campo label="Série / ano"><input {...bind('serie')} required placeholder="5º Ano" /></Campo>
          <Campo label="Escola"><input {...bind('escola')} /></Campo>
          <Campo label="Cidade/UF"><input {...bind('cidade_uf')} /></Campo>
          <Campo label="Resultado"><select {...bind('resultado')}><option>Aprovado</option><option>Reprovado</option><option>Promovido</option></select></Campo>
        </div>
        <div className="tabela-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Disciplina</th><th className="num">Nota / conceito</th><th className="num">C.H.</th></tr></thead>
            <tbody>
              {disciplinas?.map((d) => (
                <tr key={d.id}>
                  <td>{d.nome}</td>
                  <td className="num"><input className="input-nota" value={notas[d.id]?.nota || ''} onChange={(e) => setNotas((n) => ({ ...n, [d.id]: { ...n[d.id], nota: e.target.value } }))} /></td>
                  <td className="num"><input className="input-nota" placeholder={d.carga_horaria} value={notas[d.id]?.ch || ''} onChange={(e) => setNotas((n) => ({ ...n, [d.id]: { ...n[d.id], ch: e.target.value } }))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-rodape"><button type="button" className="btn sec" onClick={onClose}>Cancelar</button><button className="btn">Salvar</button></div>
      </form>
    </Modal>
  );
}
