import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, getConfig, FOTOS_DIR } from '../db.js';
import { ControlId, EVENTOS } from '../controlid.js';
import { wrap } from './cadastros.js';

const r = Router();
const agora = () => new Date().toLocaleString('sv-SE');

const dispositivosAtivos = () => db.prepare('SELECT * FROM dispositivos WHERE ativo = 1').all();
const marcar = (d, status) =>
  db.prepare('UPDATE dispositivos SET status = ?, ultima_comunicacao = ? WHERE id = ?').run(status, agora(), d.id);

/* ---------------- Sincronização de alunos ---------------- */
async function sincronizarAluno(aluno, disps) {
  const erros = [];
  const foto = path.join(FOTOS_DIR, `${aluno.id}.jpg`);
  const jpeg = aluno.foto && fs.existsSync(foto) ? fs.readFileSync(foto) : null;
  for (const d of disps) {
    const c = new ControlId(d);
    try {
      await c.salvarUsuario({ id: aluno.id, nome: aluno.nome, matricula: aluno.matricula, bloqueado: !!aluno.bloqueado || !aluno.ativo });
      if (jpeg) await c.enviarFoto(aluno.id, jpeg);
      marcar(d, 'online');
    } catch (e) {
      erros.push(`${d.nome}: ${e.message}`);
      if (/comunicação/.test(e.message)) marcar(d, 'offline');
    }
  }
  if (!disps.length) erros.push('Nenhum equipamento ativo cadastrado');
  db.prepare('UPDATE alunos SET catraca_sync = ?, catraca_erro = ? WHERE id = ?')
    .run(erros.length ? null : agora(), erros.join(' | ') || null, aluno.id);
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
  const cfg = getConfig();
  const portalEntrada = Number(cfg.catraca_portal_entrada) || 1;
  const resumo = [];
  try {
    const existeAluno = db.prepare('SELECT 1 FROM alunos WHERE id = ?');
    const ins = db.prepare(`INSERT OR IGNORE INTO acessos (dispositivo_id, log_id, aluno_id, data_hora, tipo, evento, descricao)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const d of dispositivosAtivos()) {
      const c = new ControlId(d);
      let total = 0, emTx = false;
      try {
        for (let lote = 0; lote < 20; lote++) {
          const logs = await c.logsDesde(d.ultimo_log_id);
          if (!logs.length) break;
          db.exec('BEGIN'); emTx = true;
          for (const l of logs) {
            let tipo = 'outro';
            if (l.event === 7) {
              if (d.sentido === 'entrada' || d.sentido === 'saida') tipo = d.sentido;
              else tipo = l.portal_id === portalEntrada ? 'entrada' : 'saida';
            } else if (l.event === 6) tipo = 'negado';
            else if (l.event === 3) tipo = 'nao_identificado';
            const alunoId = l.user_id && existeAluno.get(l.user_id) ? l.user_id : null;
            ins.run(d.id, l.id, alunoId, formatarHora(l.time, cfg.catraca_hora), tipo, l.event, EVENTOS[l.event] || `Evento ${l.event}`);
            d.ultimo_log_id = Math.max(d.ultimo_log_id, l.id);
          }
          db.prepare('UPDATE dispositivos SET ultimo_log_id = ? WHERE id = ?').run(d.ultimo_log_id, d.id);
          db.exec('COMMIT'); emTx = false;
          total += logs.length;
          if (logs.length < 500) break;
        }
        marcar(d, 'online');
        resumo.push({ dispositivo: d.nome, novos: total });
      } catch (e) {
        if (emTx) db.exec('ROLLBACK');
        marcar(d, 'offline');
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
    const cfg = getConfig();
    if (cfg.catraca_coleta_auto === '1' && dispositivosAtivos().length) {
      try { await coletarAcessos(); } catch (e) { console.error('Coleta catraca:', e.message); }
    }
    timer = setTimeout(ciclo, Math.max(10, Number(cfg.catraca_intervalo) || 30) * 1000);
  };
  timer = setTimeout(ciclo, 5000);
}

/* ---------------- Rotas ---------------- */
const DISP = ['nome', 'ip', 'porta', 'usuario', 'senha', 'sentido', 'ativo'];
const pick = (b) => Object.fromEntries(DISP.filter((k) => k in (b || {})).map((k) => [k, b[k]]));

r.get('/dispositivos', wrap((req, res) => {
  res.json(db.prepare('SELECT id, nome, ip, porta, usuario, sentido, ativo, ultimo_log_id, status, ultima_comunicacao FROM dispositivos ORDER BY nome').all());
}));
r.post('/dispositivos', wrap((req, res) => {
  const d = pick(req.body);
  if (!d.nome || !d.ip) return res.status(400).json({ erro: 'Informe nome e IP' });
  const k = Object.keys(d);
  const x = db.prepare(`INSERT INTO dispositivos (${k}) VALUES (${k.map(() => '?')})`).run(...k.map((i) => d[i]));
  res.json({ id: Number(x.lastInsertRowid) });
}));
r.put('/dispositivos/:id', wrap((req, res) => {
  const d = pick(req.body);
  if (!d.senha) delete d.senha; // senha em branco = manter
  const k = Object.keys(d);
  if (k.length) db.prepare(`UPDATE dispositivos SET ${k.map((i) => `${i} = ?`)} WHERE id = ?`).run(...k.map((i) => d[i]), req.params.id);
  res.json({ ok: true });
}));
r.delete('/dispositivos/:id', wrap((req, res) => {
  db.prepare('DELETE FROM dispositivos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));
r.post('/dispositivos/:id/testar', async (req, res) => {
  const d = db.prepare('SELECT * FROM dispositivos WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ erro: 'Equipamento não encontrado' });
  try {
    const info = await new ControlId(d).info();
    marcar(d, 'online');
    res.json({ ok: true, info });
  } catch (e) {
    marcar(d, 'offline');
    res.status(502).json({ erro: e.message });
  }
});
/** Recomeça a leitura dos registros do zero (reimporta o que ainda estiver no equipamento). */
r.post('/dispositivos/:id/reiniciar-leitura', wrap((req, res) => {
  db.prepare('UPDATE dispositivos SET ultimo_log_id = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

r.get('/alunos', wrap((req, res) => {
  const hoje = new Date().toLocaleDateString('sv-SE');
  const where = ['a.ativo = 1'], p = [hoje];
  if (req.query.turma_id) { where.push('EXISTS (SELECT 1 FROM matriculas m WHERE m.aluno_id = a.id AND m.turma_id = ?)'); p.push(req.query.turma_id); }
  if (req.query.q) { where.push('(a.nome LIKE ? OR a.matricula LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  res.json(db.prepare(`
    SELECT a.id, a.nome, a.matricula, a.foto, a.bloqueado, a.catraca_sync, a.catraca_erro,
      (SELECT t.nome FROM matriculas m JOIN turmas t ON t.id = m.turma_id WHERE m.aluno_id = a.id ORDER BY t.ano_letivo DESC LIMIT 1) AS turma,
      (SELECT tipo || '|' || data_hora FROM acessos x WHERE x.aluno_id = a.id AND x.tipo IN ('entrada','saida')
         AND substr(x.data_hora,1,10) = ? ORDER BY x.data_hora DESC LIMIT 1) AS ultimo_hoje
    FROM alunos a WHERE ${where.join(' AND ')} ORDER BY a.nome`).all(...p));
}));

r.post('/sincronizar', async (req, res) => {
  const disps = dispositivosAtivos();
  let alunos;
  if (req.body?.aluno_ids?.length) {
    alunos = db.prepare(`SELECT * FROM alunos WHERE id IN (${req.body.aluno_ids.map(() => '?')})`).all(...req.body.aluno_ids);
  } else if (req.body?.pendentes) {
    alunos = db.prepare('SELECT * FROM alunos WHERE ativo = 1 AND catraca_sync IS NULL').all();
  } else {
    alunos = db.prepare('SELECT * FROM alunos WHERE ativo = 1').all();
  }
  const resultados = [];
  for (const a of alunos) resultados.push(await sincronizarAluno(a, disps));
  res.json({ total: resultados.length, ok: resultados.filter((x) => x.ok).length, erros: resultados.filter((x) => !x.ok) });
});

r.post('/alunos/:id/bloqueio', async (req, res) => {
  const bloqueado = req.body?.bloqueado ? 1 : 0;
  db.prepare('UPDATE alunos SET bloqueado = ? WHERE id = ?').run(bloqueado, req.params.id);
  const aluno = db.prepare('SELECT * FROM alunos WHERE id = ?').get(req.params.id);
  if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado' });
  const erros = [];
  for (const d of dispositivosAtivos()) {
    try {
      const c = new ControlId(d);
      if (await c.existe(aluno.id)) await c.definirBloqueio(aluno.id, bloqueado || !aluno.ativo);
      else await c.salvarUsuario({ id: aluno.id, nome: aluno.nome, matricula: aluno.matricula, bloqueado: bloqueado || !aluno.ativo });
    } catch (e) { erros.push(`${d.nome}: ${e.message}`); }
  }
  res.json({ ok: !erros.length, bloqueado, erro: erros.join(' | ') || null });
});

r.post('/alunos/:id/remover', async (req, res) => {
  const erros = [];
  for (const d of dispositivosAtivos()) {
    try { await new ControlId(d).removerUsuario(Number(req.params.id)); } catch (e) { erros.push(`${d.nome}: ${e.message}`); }
  }
  db.prepare('UPDATE alunos SET catraca_sync = NULL, catraca_erro = ? WHERE id = ?').run(erros.join(' | ') || null, req.params.id);
  res.json({ ok: !erros.length, erro: erros.join(' | ') || null });
});

r.post('/coletar', async (req, res) => {
  try { res.json(await coletarAcessos()); } catch (e) { res.status(500).json({ erro: e.message }); }
});

r.get('/acessos', wrap((req, res) => {
  const where = [], p = [];
  const ini = req.query.de || new Date().toLocaleDateString('sv-SE');
  const fim = req.query.ate || ini;
  where.push('substr(x.data_hora,1,10) BETWEEN ? AND ?'); p.push(ini, fim);
  if (req.query.aluno_id) { where.push('x.aluno_id = ?'); p.push(req.query.aluno_id); }
  if (req.query.tipo) { where.push('x.tipo = ?'); p.push(req.query.tipo); }
  if (req.query.turma_id) { where.push('EXISTS (SELECT 1 FROM matriculas m WHERE m.aluno_id = x.aluno_id AND m.turma_id = ?)'); p.push(req.query.turma_id); }
  const lista = db.prepare(`
    SELECT x.*, a.nome AS aluno, a.matricula, d.nome AS dispositivo FROM acessos x
    LEFT JOIN alunos a ON a.id = x.aluno_id LEFT JOIN dispositivos d ON d.id = x.dispositivo_id
    WHERE ${where.join(' AND ')} ORDER BY x.data_hora DESC LIMIT 2000`).all(...p);
  res.json(lista);
}));

r.get('/resumo', wrap((req, res) => {
  const hoje = new Date().toLocaleDateString('sv-SE');
  const ult = db.prepare(`
    SELECT x.aluno_id, x.tipo FROM acessos x
    WHERE x.aluno_id IS NOT NULL AND x.tipo IN ('entrada','saida') AND substr(x.data_hora,1,10) = ?
      AND x.data_hora = (SELECT MAX(y.data_hora) FROM acessos y WHERE y.aluno_id = x.aluno_id AND y.tipo IN ('entrada','saida') AND substr(y.data_hora,1,10) = ?)`)
    .all(hoje, hoje);
  const c = (sql, ...pp) => db.prepare(sql).get(...pp).n;
  res.json({
    naEscola: ult.filter((u) => u.tipo === 'entrada').length,
    sairam: ult.filter((u) => u.tipo === 'saida').length,
    negadosHoje: c("SELECT COUNT(*) n FROM acessos WHERE tipo = 'negado' AND substr(data_hora,1,10) = ?", hoje),
    pendentesSync: c('SELECT COUNT(*) n FROM alunos WHERE ativo = 1 AND catraca_sync IS NULL'),
    semFoto: c('SELECT COUNT(*) n FROM alunos WHERE ativo = 1 AND foto = 0'),
    bloqueados: c('SELECT COUNT(*) n FROM alunos WHERE ativo = 1 AND bloqueado = 1'),
    dispositivos: db.prepare('SELECT id, nome, status, ultima_comunicacao FROM dispositivos WHERE ativo = 1').all(),
  });
}));

export default r;
