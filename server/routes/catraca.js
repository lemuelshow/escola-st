import { Router } from 'express';
import { db, getConfig, transaction } from '../db.js';
import { ControlId, EVENTOS } from '../controlid.js';
import { wrap } from './cadastros.js';

const r = Router();
const agora = () => new Date().toLocaleString('sv-SE');

const dispositivosAtivos = () => db.all('SELECT * FROM dispositivos WHERE ativo = 1');
const marcar = (d, status) =>
  db.run('UPDATE dispositivos SET status = ?, ultima_comunicacao = ? WHERE id = ?', status, agora(), d.id).catch(() => {});

/* ---------------- Sincronização de alunos ---------------- */
async function sincronizarAluno(aluno, disps) {
  const erros = [];
  const jpeg = aluno.foto ? (await db.get('SELECT dados FROM fotos WHERE aluno_id = ?', aluno.id))?.dados : null;
  for (const d of disps) {
    const c = new ControlId(d);
    try {
      await c.salvarUsuario({ id: aluno.id, nome: aluno.nome, matricula: aluno.matricula, bloqueado: !!aluno.bloqueado || !aluno.ativo });
      if (jpeg) await c.enviarFoto(aluno.id, jpeg);
      await marcar(d, 'online');
    } catch (e) {
      erros.push(`${d.nome}: ${e.message}`);
      if (/comunicação/.test(e.message)) await marcar(d, 'offline');
    }
  }
  if (!disps.length) erros.push('Nenhum equipamento ativo cadastrado');
  await db.run('UPDATE alunos SET catraca_sync = ?, catraca_erro = ? WHERE id = ?',
    erros.length ? null : agora(), erros.join(' | ') || null, aluno.id);
  return { id: aluno.id, nome: aluno.nome, ok: !erros.length, erro: erros.join(' | ') };
}

/* ---------------- Coleta de registros de acesso ---------------- */
function formatarHora(ts, modo) {
  const dt = new Date(ts * 1000);
  // Os equipamentos Control iD normalmente gravam a hora local como se fosse UTC.
  if (modo === 'local') return dt.toISOString().slice(0, 19).replace('T', ' ');
  return dt.toLocaleString('sv-SE');
}

let coletando = false;
export async function coletarAcessos() {
  if (coletando) return { ignorado: true };
  coletando = true;
  const cfg = await getConfig();
  const portalEntrada = Number(cfg.catraca_portal_entrada) || 1;
  const resumo = [];
  try {
    for (const d of await dispositivosAtivos()) {
      const c = new ControlId(d);
      let total = 0;
      try {
        for (let lote = 0; lote < 20; lote++) {
          const logs = await c.logsDesde(d.ultimo_log_id);
          if (!logs.length) break;
          const ids = [...new Set(logs.map((l) => l.user_id).filter(Boolean))];
          const existentes = new Set(ids.length
            ? (await db.all('SELECT id FROM alunos WHERE id = ANY(?::int[])', ids)).map((x) => x.id) : []);
          let ultimo = d.ultimo_log_id;
          await transaction(async () => {
            for (const l of logs) {
              let tipo = 'outro';
              if (l.event === 7) {
                if (d.sentido === 'entrada' || d.sentido === 'saida') tipo = d.sentido;
                else tipo = l.portal_id === portalEntrada ? 'entrada' : 'saida';
              } else if (l.event === 6) tipo = 'negado';
              else if (l.event === 3) tipo = 'nao_identificado';
              const alunoId = existentes.has(l.user_id) ? l.user_id : null;
              await db.run(`INSERT INTO acessos (dispositivo_id, log_id, aluno_id, data_hora, tipo, evento, descricao)
                VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
              d.id, l.id, alunoId, formatarHora(l.time, cfg.catraca_hora), tipo, l.event, EVENTOS[l.event] || `Evento ${l.event}`);
              ultimo = Math.max(ultimo, l.id);
            }
            await db.run('UPDATE dispositivos SET ultimo_log_id = ? WHERE id = ?', ultimo, d.id);
          });
          d.ultimo_log_id = ultimo;
          total += logs.length;
          if (logs.length < 500) break;
        }
        await marcar(d, 'online');
        resumo.push({ dispositivo: d.nome, novos: total });
      } catch (e) {
        await marcar(d, 'offline');
        resumo.push({ dispositivo: d.nome, erro: e.message });
      }
    }
  } finally {
    coletando = false;
  }
  return resumo;
}

let timer = null;
export function iniciarColetaAutomatica() {
  clearTimeout(timer);
  const ciclo = async () => {
    let intervalo = 30;
    try {
      const cfg = await getConfig();
      intervalo = Number(cfg.catraca_intervalo) || 30;
      if (cfg.catraca_coleta_auto === '1' && (await dispositivosAtivos()).length) await coletarAcessos();
    } catch (e) { console.error('Coleta catraca:', e.message); }
    timer = setTimeout(ciclo, Math.max(10, intervalo) * 1000);
  };
  timer = setTimeout(ciclo, 5000);
}

/* ---------------- Rotas ---------------- */
const DISP = ['nome', 'ip', 'porta', 'usuario', 'senha', 'sentido', 'ativo'];
const pick = (b) => Object.fromEntries(DISP.filter((k) => k in (b || {})).map((k) => [k, b[k]]));

r.get('/dispositivos', wrap(async (req, res) => {
  res.json(await db.all('SELECT id, nome, ip, porta, usuario, sentido, ativo, ultimo_log_id, status, ultima_comunicacao FROM dispositivos ORDER BY nome'));
}));
r.post('/dispositivos', wrap(async (req, res) => {
  const d = pick(req.body);
  if (!d.nome || !d.ip) return res.status(400).json({ erro: 'Informe nome e IP' });
  const k = Object.keys(d);
  const { rows } = await db.run(`INSERT INTO dispositivos (${k}) VALUES (${k.map(() => '?')}) RETURNING id`, ...k.map((i) => d[i]));
  res.json({ id: rows[0].id });
}));
r.put('/dispositivos/:id', wrap(async (req, res) => {
  const d = pick(req.body);
  if (!d.senha) delete d.senha; // senha em branco = manter
  const k = Object.keys(d);
  if (k.length) await db.run(`UPDATE dispositivos SET ${k.map((i) => `${i} = ?`)} WHERE id = ?`, ...k.map((i) => d[i]), req.params.id);
  res.json({ ok: true });
}));
r.delete('/dispositivos/:id', wrap(async (req, res) => {
  await db.run('DELETE FROM dispositivos WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));
r.post('/dispositivos/:id/testar', wrap(async (req, res) => {
  const d = await db.get('SELECT * FROM dispositivos WHERE id = ?', req.params.id);
  if (!d) return res.status(404).json({ erro: 'Equipamento não encontrado' });
  try {
    const info = await new ControlId(d).info();
    await marcar(d, 'online');
    res.json({ ok: true, info });
  } catch (e) {
    await marcar(d, 'offline');
    res.status(502).json({ erro: e.message });
  }
}));
/** Recomeça a leitura dos registros do zero (reimporta o que ainda estiver no equipamento). */
r.post('/dispositivos/:id/reiniciar-leitura', wrap(async (req, res) => {
  await db.run('UPDATE dispositivos SET ultimo_log_id = 0 WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

r.get('/alunos', wrap(async (req, res) => {
  const hoje = new Date().toLocaleDateString('sv-SE');
  const where = ['a.ativo = 1'], p = [hoje];
  if (req.query.turma_id) { where.push('EXISTS (SELECT 1 FROM matriculas m WHERE m.aluno_id = a.id AND m.turma_id = ?)'); p.push(req.query.turma_id); }
  if (req.query.q) { where.push('(a.nome ILIKE ? OR a.matricula ILIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  res.json(await db.all(`
    SELECT a.id, a.nome, a.matricula, a.foto, a.bloqueado, a.catraca_sync, a.catraca_erro,
      (SELECT t.nome FROM matriculas m JOIN turmas t ON t.id = m.turma_id WHERE m.aluno_id = a.id ORDER BY t.ano_letivo DESC LIMIT 1) AS turma,
      (SELECT tipo || '|' || data_hora FROM acessos x WHERE x.aluno_id = a.id AND x.tipo IN ('entrada','saida')
         AND substr(x.data_hora,1,10) = ? ORDER BY x.data_hora DESC LIMIT 1) AS ultimo_hoje
    FROM alunos a WHERE ${where.join(' AND ')} ORDER BY a.nome`, ...p));
}));

r.post('/sincronizar', wrap(async (req, res) => {
  const disps = await dispositivosAtivos();
  let alunos;
  if (req.body?.aluno_ids?.length) {
    alunos = await db.all('SELECT * FROM alunos WHERE id = ANY(?::int[])', req.body.aluno_ids.map(Number));
  } else if (req.body?.pendentes) {
    alunos = await db.all('SELECT * FROM alunos WHERE ativo = 1 AND catraca_sync IS NULL');
  } else {
    alunos = await db.all('SELECT * FROM alunos WHERE ativo = 1');
  }
  const resultados = [];
  for (const a of alunos) resultados.push(await sincronizarAluno(a, disps));
  res.json({ total: resultados.length, ok: resultados.filter((x) => x.ok).length, erros: resultados.filter((x) => !x.ok) });
}));

r.post('/alunos/:id/bloqueio', wrap(async (req, res) => {
  const bloqueado = req.body?.bloqueado ? 1 : 0;
  await db.run('UPDATE alunos SET bloqueado = ? WHERE id = ?', bloqueado, req.params.id);
  const aluno = await db.get('SELECT * FROM alunos WHERE id = ?', req.params.id);
  if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado' });
  const erros = [];
  for (const d of await dispositivosAtivos()) {
    try {
      const c = new ControlId(d);
      if (await c.existe(aluno.id)) await c.definirBloqueio(aluno.id, bloqueado || !aluno.ativo);
      else await c.salvarUsuario({ id: aluno.id, nome: aluno.nome, matricula: aluno.matricula, bloqueado: bloqueado || !aluno.ativo });
    } catch (e) { erros.push(`${d.nome}: ${e.message}`); }
  }
  res.json({ ok: !erros.length, bloqueado, erro: erros.join(' | ') || null });
}));

r.post('/alunos/:id/remover', wrap(async (req, res) => {
  const erros = [];
  for (const d of await dispositivosAtivos()) {
    try { await new ControlId(d).removerUsuario(Number(req.params.id)); } catch (e) { erros.push(`${d.nome}: ${e.message}`); }
  }
  await db.run('UPDATE alunos SET catraca_sync = NULL, catraca_erro = ? WHERE id = ?', erros.join(' | ') || null, req.params.id);
  res.json({ ok: !erros.length, erro: erros.join(' | ') || null });
}));

r.post('/coletar', wrap(async (req, res) => res.json(await coletarAcessos())));

r.get('/acessos', wrap(async (req, res) => {
  const where = [], p = [];
  const ini = req.query.de || new Date().toLocaleDateString('sv-SE');
  const fim = req.query.ate || ini;
  where.push('substr(x.data_hora,1,10) BETWEEN ? AND ?'); p.push(ini, fim);
  if (req.query.aluno_id) { where.push('x.aluno_id = ?'); p.push(req.query.aluno_id); }
  if (req.query.tipo) { where.push('x.tipo = ?'); p.push(req.query.tipo); }
  if (req.query.turma_id) { where.push('EXISTS (SELECT 1 FROM matriculas m WHERE m.aluno_id = x.aluno_id AND m.turma_id = ?)'); p.push(req.query.turma_id); }
  res.json(await db.all(`
    SELECT x.*, a.nome AS aluno, a.matricula, d.nome AS dispositivo FROM acessos x
    LEFT JOIN alunos a ON a.id = x.aluno_id LEFT JOIN dispositivos d ON d.id = x.dispositivo_id
    WHERE ${where.join(' AND ')} ORDER BY x.data_hora DESC LIMIT 2000`, ...p));
}));

r.get('/resumo', wrap(async (req, res) => {
  const hoje = new Date().toLocaleDateString('sv-SE');
  const c = async (sql, ...pp) => (await db.get(sql, ...pp)).n;
  const [ult, negadosHoje, pendentesSync, semFoto, bloqueados, dispositivos] = await Promise.all([
    // última passagem (entrada/saída) de cada aluno hoje
    db.all(`
      SELECT DISTINCT ON (x.aluno_id) x.aluno_id, x.tipo FROM acessos x
      WHERE x.aluno_id IS NOT NULL AND x.tipo IN ('entrada','saida') AND substr(x.data_hora,1,10) = ?
      ORDER BY x.aluno_id, x.data_hora DESC`, hoje),
    c("SELECT COUNT(*) n FROM acessos WHERE tipo = 'negado' AND substr(data_hora,1,10) = ?", hoje),
    c('SELECT COUNT(*) n FROM alunos WHERE ativo = 1 AND catraca_sync IS NULL'),
    c('SELECT COUNT(*) n FROM alunos WHERE ativo = 1 AND foto = 0'),
    c('SELECT COUNT(*) n FROM alunos WHERE ativo = 1 AND bloqueado = 1'),
    db.all('SELECT id, nome, status, ultima_comunicacao FROM dispositivos WHERE ativo = 1'),
  ]);
  res.json({
    naEscola: ult.filter((u) => u.tipo === 'entrada').length,
    sairam: ult.filter((u) => u.tipo === 'saida').length,
    negadosHoje, pendentesSync, semFoto, bloqueados, dispositivos,
  });
}));

export default r;
