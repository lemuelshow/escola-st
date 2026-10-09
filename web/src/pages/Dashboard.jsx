import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../App.jsx';
import { Badge, Estado, useApi } from '../components/ui.jsx';
import { fmtData, fmtNota } from '../api.js';

const fmtPct = (n) => (n == null ? '—' : `${String(n).replace('.', ',')}%`);
const diaCurto = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
const diaSemana = (d) => new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

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

/* ---------------- Gestor ---------------- */
function PainelGestor({ d }) {
  const pctPresentes = d.alunos ? Math.round((100 * d.entradasHoje) / d.alunos) : 0;
  return (
    <div className="dash">
      <div className="dash-kpis">
        <Kpi to="/alunos" rotulo="Alunos ativos" valor={d.alunos} nota={d.semTurma ? `${d.semTurma} sem turma` : 'Todos enturmados'} />
        <Kpi to="/catraca" rotulo="Presentes hoje (catraca)" valor={d.entradasHoje} nota={`${pctPresentes}% dos alunos ativos`} medidor={pctPresentes} />
        <Kpi to="/diario" rotulo="Frequência média" valor={fmtPct(d.frequenciaGeral)} nota={`Mínimo exigido: ${d.frequenciaMinima}%`} medidor={d.frequenciaGeral} alerta={d.frequenciaGeral != null && d.frequenciaGeral < d.frequenciaMinima} />
        <Kpi to="/turmas" rotulo="Média geral" valor={fmtNota(d.mediaGeral) || '—'} nota={`Média de aprovação: ${fmtNota(d.mediaAprovacao)}`} medidor={d.mediaGeral != null ? d.mediaGeral * 10 : null} alerta={d.mediaGeral != null && d.mediaGeral < d.mediaAprovacao} />
      </div>
      <div className="dash-mini">
        <Link to="/turmas"><b>{d.turmasAtivas}</b> turmas ativas</Link>
        <Link to="/professores"><b>{d.professores}</b> professores</Link>
        <Link to="/diario"><b>{d.aulasHoje}</b> aulas lançadas hoje</Link>
      </div>

      <div className="dash-grade">
        <section className="cartao dash-cartao">
          <header><h2>Frequência diária</h2><small>Diário de classe · últimos {d.frequenciaDiaria.length} dias letivos</small></header>
          {d.frequenciaDiaria.length ? <GraficoLinha pontos={d.frequenciaDiaria} minimo={d.frequenciaMinima} /> : <small>Nenhuma chamada lançada ainda.</small>}
        </section>
        <section className="cartao dash-cartao">
          <header><h2>Entradas pela catraca</h2><small>Alunos distintos por dia · últimos 10 dias úteis</small></header>
          <GraficoColunas pontos={d.entradasDias} total={d.alunos} />
        </section>
      </div>

      <div className="dash-grade">
        <section className="cartao dash-cartao">
          <header><h2>Desempenho dos alunos</h2><small>Pela média das notas lançadas</small></header>
          <Desempenho d={d.desempenho} media={d.mediaAprovacao} />
        </section>
        <section className="cartao dash-cartao">
          <header><h2>Turmas</h2><small>Alunos cursando, frequência e média</small></header>
          <TabelaTurmas turmas={d.turmas} minimo={d.frequenciaMinima} media={d.mediaAprovacao} />
        </section>
      </div>

      <div className="dash-grade dash-grade-3">
        <section className="cartao dash-cartao">
          <header><h2>Alunos em atenção</h2><small>Média abaixo de {fmtNota(d.mediaAprovacao)} ou frequência abaixo de {d.frequenciaMinima}%</small></header>
          {d.emAtencao.length ? (
            <ul className="dash-lista">
              {d.emAtencao.map((a) => (
                <li key={a.aluno_id}>
                  <Link to={`/alunos/${a.aluno_id}`}>{a.nome}</Link>
                  <small>{a.turma}</small>
                  <span className="dash-lista-tags">
                    {a.media != null && a.media < d.mediaAprovacao && <Badge cor="vermelho">▼ Média {fmtNota(a.media)}</Badge>}
                    {a.frequencia != null && a.frequencia < d.frequenciaMinima && <Badge cor="amarelo">⚠ Freq. {fmtPct(a.frequencia)}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <small>✓ Nenhum aluno abaixo da média ou da frequência mínima.</small>}
        </section>
        <section className="cartao dash-cartao">
          <header><h2>Últimas passagens</h2><small><Link to="/catraca">Ver todas na catraca</Link></small></header>
          {d.ultimosAcessos.length ? (
            <ul className="dash-lista">
              {d.ultimosAcessos.map((a) => (
                <li key={a.id}>
                  {a.aluno_id ? <Link to={`/alunos/${a.aluno_id}`}>{a.aluno}</Link> : <span>Não identificado</span>}
                  <small>{fmtData(a.data_hora)} {a.data_hora.slice(11, 16)}</small>
                  <span className="dash-lista-tags"><Badge cor={TIPO_ACESSO[a.tipo]?.[1]}>{TIPO_ACESSO[a.tipo]?.[0] || a.tipo}</Badge></span>
                </li>
              ))}
            </ul>
          ) : <small>Nenhuma passagem registrada.</small>}
        </section>
        <section className="cartao dash-cartao">
          <header><h2>Disciplinas sem professor</h2><small>Turmas ativas</small></header>
          {d.semProfessor.length ? (
            <ul className="dash-lista">
              {d.semProfessor.map((x, i) => <li key={i}><span>{x.disciplina}</span><small>{x.turma}</small></li>)}
            </ul>
          ) : <small>✓ Todas as disciplinas das turmas ativas têm professor atribuído.</small>}
        </section>
      </div>
    </div>
  );
}

const TIPO_ACESSO = { entrada: ['Entrada', 'verde'], saida: ['Saída', 'azul'], negado: ['Negado', 'vermelho'], nao_identificado: ['Não identificado', 'amarelo'] };

function Kpi({ to, rotulo, valor, nota, medidor, alerta }) {
  return (
    <Link to={to} className="kpi dash-kpi">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {medidor != null && (
        <div className={`medidor ${alerta ? 'alerta' : ''}`} role="img" aria-label={`${Math.round(medidor)}%`}>
          <span style={{ width: `${Math.max(0, Math.min(100, medidor))}%` }} />
        </div>
      )}
      <small>{alerta ? '⚠ ' : ''}{nota}</small>
    </Link>
  );
}

/* Linha com área, crosshair e tooltip */
function GraficoLinha({ pontos, minimo }) {
  const [hover, setHover] = useState(null);
  const W = 560, H = 220, m = { t: 16, r: 48, b: 28, l: 40 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const vals = pontos.map((p) => p.pct);
  const yMin = Math.max(0, Math.floor((Math.min(...vals, minimo) - 2) / 10) * 10);
  const y = (v) => m.t + ih - ((v - yMin) / (100 - yMin)) * ih;
  const x = (i) => m.l + (pontos.length === 1 ? iw / 2 : (i * iw) / (pontos.length - 1));
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.pct)}`).join(' ');
  const area = `${linha} L${x(pontos.length - 1)},${y(yMin)} L${x(0)},${y(yMin)} Z`;
  const ticks = [];
  const passoY = 100 - yMin <= 40 ? 10 : 20;
  for (let v = 100; v >= yMin; v -= passoY) ticks.push(v);
  const ult = pontos[pontos.length - 1];
  const passo = Math.ceil(pontos.length / 6);

  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - m.l) / iw) * (pontos.length - 1));
    setHover(Math.max(0, Math.min(pontos.length - 1, i)));
  };
  const h = hover != null ? pontos[hover] : null;

  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Frequência diária em porcentagem" onMouseMove={mover} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grade" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
            <text className="eixo" x={m.l - 8} y={y(t) + 4} textAnchor="end">{t}%</text>
          </g>
        ))}
        {minimo > yMin && (
          <g>
            <line className="referencia" x1={m.l} x2={W - m.r} y1={y(minimo)} y2={y(minimo)} />
            <text className="eixo" x={W - m.r + 6} y={y(minimo) + 4}>mín.</text>
          </g>
        )}
        {pontos.map((p, i) => i % passo === 0 && (
          <text key={p.dia} className="eixo" x={x(i)} y={H - 8} textAnchor="middle">{diaCurto(p.dia)}</text>
        ))}
        <path className="area" d={area} />
        <path className="linha" d={linha} />
        <circle className="ponto" cx={x(pontos.length - 1)} cy={y(ult.pct)} r="4.5" />
        <text className="rotulo-valor" x={x(pontos.length - 1) + 9} y={y(ult.pct) + 4}>{Math.round(ult.pct)}%</text>
        {h && (
          <g>
            <line className="mira" x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} />
            <circle className="ponto" cx={x(hover)} cy={y(h.pct)} r="5" />
          </g>
        )}
      </svg>
      {h && (
        <div className="dica" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.pct) / H) * 100}%` }}>
          <b>{fmtPct(h.pct)}</b> de presença<br /><small>{diaSemana(h.dia)}, {fmtData(h.dia)}</small>
        </div>
      )}
    </div>
  );
}

/* Colunas com tooltip por barra */
function GraficoColunas({ pontos, total }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(total || 0, ...pontos.map((p) => p.n), 1);
  return (
    <div className="colunas" onMouseLeave={() => setHover(null)}>
      <div className="colunas-area">
        {pontos.map((p, i) => {
          const ultima = i === pontos.length - 1;
          return (
            <div key={p.dia} className="coluna" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
              aria-label={`${fmtData(p.dia)}: ${p.n} alunos`}>
              {(ultima || hover === i) && <span className="coluna-valor">{p.n}</span>}
              <span className={`coluna-barra ${hover === i ? 'ativa' : ''}`} style={{ height: `${(p.n / max) * 100}%` }} />
              {hover === i && (
                <div className="dica dica-coluna">
                  <b>{p.n}</b> de {total} alunos<br /><small>{diaSemana(p.dia)}, {fmtData(p.dia)}</small>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="colunas-eixo">
        {pontos.map((p) => <span key={p.dia}>{diaCurto(p.dia)}</span>)}
      </div>
    </div>
  );
}

/* Barra empilhada de situações + legenda com contagem */
function Desempenho({ d, media }) {
  const itens = [
    { k: 'acima', rotulo: `Na média ou acima (≥ ${fmtNota(media)})`, icone: '✓', cls: 'bom', n: d.acima },
    { k: 'atencao', rotulo: `Atenção (${fmtNota(media - 1)} a ${fmtNota(media - 0.1)})`, icone: '!', cls: 'atencao', n: d.atencao },
    { k: 'abaixo', rotulo: `Abaixo (< ${fmtNota(media - 1)})`, icone: '▼', cls: 'critico', n: d.abaixo },
    { k: 'semNotas', rotulo: 'Sem notas lançadas', icone: '–', cls: 'neutro', n: d.semNotas },
  ];
  const total = itens.reduce((s, x) => s + x.n, 0);
  if (!total) return <small>Nenhum aluno cursando.</small>;
  const pctBom = Math.round((100 * d.acima) / total);
  return (
    <div className="desempenho">
      <div className="desempenho-destaque"><b>{pctBom}%</b> <span>dos alunos estão na média ou acima</span></div>
      <div className="empilhada" role="img" aria-label={itens.map((x) => `${x.rotulo}: ${x.n}`).join(', ')}>
        {itens.filter((x) => x.n).map((x) => (
          <span key={x.k} className={x.cls} style={{ flexGrow: x.n }} title={`${x.rotulo}: ${x.n}`} />
        ))}
      </div>
      <ul className="legenda">
        {itens.map((x) => (
          <li key={x.k}>
            <span className={`legenda-marca ${x.cls}`}>{x.icone}</span>
            <span>{x.rotulo}</span>
            <b>{x.n}</b>
            <small>{Math.round((100 * x.n) / total)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabelaTurmas({ turmas, minimo, media }) {
  if (!turmas.length) return <small>Nenhuma turma ativa com alunos.</small>;
  return (
    <table className="dash-turmas">
      <thead><tr><th>Turma</th><th className="num">Alunos</th><th>Frequência</th><th>Média</th></tr></thead>
      <tbody>
        {turmas.map((t) => (
          <tr key={t.id}>
            <td><Link to={`/turmas/${t.id}`}>{t.turma}</Link></td>
            <td className="num">{t.alunos}</td>
            <td><Barra valor={t.frequencia} max={100} texto={fmtPct(t.frequencia)} alerta={t.frequencia != null && t.frequencia < minimo} /></td>
            <td><Barra valor={t.media} max={10} texto={fmtNota(t.media) || '—'} alerta={t.media != null && t.media < media} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Barra({ valor, max, texto, alerta }) {
  return (
    <div className="barra-celula">
      <div className={`medidor ${alerta ? 'alerta' : ''}`}><span style={{ width: `${valor == null ? 0 : (100 * valor) / max}%` }} /></div>
      <span>{alerta ? '⚠ ' : ''}{texto}</span>
    </div>
  );
}

/* ---------------- Professor ---------------- */
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
