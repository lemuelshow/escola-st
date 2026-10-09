import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, getConfig, transaction, FOTOS_DIR } from '../db.js';
import { gestor, podeAcessar, hashSenha, conferirSenha } from '../auth.js';
import { matriculasDaTurma } from '../calc.js';

const r = Router();

const pickFields = (body, fields) => {
  const out = {};
  for (const f of fields) if (f in (body || {})) out[f] = body[f] === '' ? null : body[f];
  return out;
};
function insert(table, data) {
  const keys = Object.keys(data);
  const res = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .run(...keys.map((k) => data[k]));
  return Number(res.lastInsertRowid);
}
function update(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ?`)
    .run(...keys.map((k) => data[k]), id);
}
const wrap = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('UNIQUE')) return res.status(409).json({ erro: 'Registro duplicado (já existe um cadastro com esses dados).' });
    if (msg.includes('FOREIGN KEY')) return res.status(409).json({ erro: 'Registro em uso; não pode ser removido.' });
    console.error(e);
    res.status(500).json({ erro: msg });
  }
};

/* ---------------- Usuário logado ---------------- */
r.get('/auth/me', (req, res) => res.json(req.user));
r.post('/auth/senha', wrap((req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id);
  if (!conferirSenha(String(req.body.atual || ''), u.senha_hash)) return res.status(400).json({ erro: 'Senha atual incorreta' });
  if (String(req.body.nova || '').length < 6) return res.status(400).json({ erro: 'A nova senha deve ter ao menos 6 caracteres' });
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(req.body.nova), u.id);
  res.json({ ok: true });
}));

/* ---------------- Configuração ---------------- */
r.get('/config', (req, res) => res.json(getConfig()));
r.put('/config', gestor, wrap((req, res) => {
  const up = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
  transaction(() => { for (const [k, v] of Object.entries(req.body || {})) up.run(k, v == null ? '' : String(v)); });
  res.json(getConfig());
}));

/* ---------------- Painel ---------------- */
r.get('/dashboard', wrap((req, res) => {
  const hoje = new Date().toLocaleDateString('sv-SE');
  if (req.user.papel === 'gestor') {
    const c = (sql, ...p) => db.prepare(sql).get(...p).n;
    const cfg = getConfig();
    const media = Number(cfg.media_aprovacao) || 6;
    const freqMin = Number(cfg.frequencia_minima) || 75;
    const alunos = c('SELECT COUNT(*) n FROM alunos WHERE ativo = 1');

    // últimos 10 dias úteis (seg–sex), do mais antigo para o mais recente
    const dias = [];
    for (const d = new Date(); dias.length < 10; d.setDate(d.getDate() - 1)) {
      if (d.getDay() % 6) dias.unshift(d.toLocaleDateString('sv-SE'));
    }
    const entradasDia = new Map(db.prepare(`
      SELECT substr(data_hora,1,10) dia, COUNT(DISTINCT aluno_id) n FROM acessos
      WHERE tipo = 'entrada' AND aluno_id IS NOT NULL AND substr(data_hora,1,10) >= ? GROUP BY dia`).all(dias[0]).map((x) => [x.dia, x.n]));

    // frequência por dia letivo (diário de classe), ponderada pela quantidade de aulas
    const frequenciaDiaria = db.prepare(`
      SELECT a.data AS dia, ROUND(100.0 * SUM(CASE WHEN f.presente = 1 THEN a.quantidade ELSE 0 END) / SUM(a.quantidade), 1) AS pct
      FROM frequencias f JOIN aulas a ON a.id = f.aula_id
      GROUP BY a.data ORDER BY a.data DESC LIMIT 30`).all().reverse();

    // indicadores por matrícula ativa: média das notas lançadas e frequência
    const porMatricula = db.prepare(`
      SELECT m.id, al.id AS aluno_id, al.nome, t.id AS turma_id, t.nome AS turma,
        (SELECT AVG(MAX(COALESCE(n.nota, 0), COALESCE(n.recuperacao, 0))) FROM notas n
          WHERE n.matricula_id = m.id AND n.bimestre <= 4 AND (n.nota IS NOT NULL OR n.recuperacao IS NOT NULL)) AS media,
        (SELECT 100.0 * SUM(CASE WHEN f.presente = 1 THEN a.quantidade ELSE 0 END) / NULLIF(SUM(a.quantidade), 0)
          FROM frequencias f JOIN aulas a ON a.id = f.aula_id WHERE f.matricula_id = m.id) AS freq
      FROM matriculas m JOIN turmas t ON t.id = m.turma_id JOIN alunos al ON al.id = m.aluno_id
      WHERE m.situacao = 'cursando' AND t.ativo = 1 AND al.ativo = 1`).all();

    const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
    const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

    const desempenho = { acima: 0, atencao: 0, abaixo: 0, semNotas: 0 };
    for (const m of porMatricula) {
      if (m.media == null) desempenho.semNotas++;
      else if (m.media >= media) desempenho.acima++;
      else if (m.media >= media - 1) desempenho.atencao++;
      else desempenho.abaixo++;
    }

    const turmasMap = new Map();
    for (const m of porMatricula) {
      if (!turmasMap.has(m.turma_id)) turmasMap.set(m.turma_id, { id: m.turma_id, turma: m.turma, alunos: 0, medias: [], freqs: [] });
      const t = turmasMap.get(m.turma_id);
      t.alunos++; t.medias.push(m.media); t.freqs.push(m.freq);
    }
    const turmas = [...turmasMap.values()]
      .map((t) => ({ id: t.id, turma: t.turma, alunos: t.alunos, media: r1(avg(t.medias)), frequencia: r1(avg(t.freqs)) }))
      .sort((a, b) => a.turma.localeCompare(b.turma, 'pt-BR'));

    const emAtencao = porMatricula
      .filter((m) => (m.media != null && m.media < media) || (m.freq != null && m.freq < freqMin))
      .map((m) => ({ aluno_id: m.aluno_id, nome: m.nome, turma: m.turma, media: r1(m.media), frequencia: r1(m.freq) }))
      .sort((a, b) => (a.media ?? 99) - (b.media ?? 99))
      .slice(0, 8);

    res.json({
      alunos,
      turmasAtivas: c('SELECT COUNT(*) n FROM turmas WHERE ativo = 1'),
      professores: c("SELECT COUNT(*) n FROM usuarios WHERE papel = 'professor' AND ativo = 1"),
      semTurma: c('SELECT COUNT(*) n FROM alunos a WHERE ativo = 1 AND NOT EXISTS (SELECT 1 FROM matriculas m JOIN turmas t ON t.id = m.turma_id WHERE m.aluno_id = a.id AND t.ativo = 1)'),
      entradasHoje: entradasDia.get(hoje) || 0,
      aulasHoje: c('SELECT COUNT(*) n FROM aulas WHERE data = ?', hoje),
      frequenciaGeral: r1(avg(porMatricula.map((m) => m.freq))),
      mediaGeral: r1(avg(porMatricula.map((m) => m.media))),
      mediaAprovacao: media,
      frequenciaMinima: freqMin,
      entradasDias: dias.map((dia) => ({ dia, n: entradasDia.get(dia) || 0 })),
      frequenciaDiaria,
      desempenho,
      turmas,
      emAtencao,
      ultimosAcessos: db.prepare(`
        SELECT x.id, x.data_hora, x.tipo, x.aluno_id, a.nome AS aluno FROM acessos x
        LEFT JOIN alunos a ON a.id = x.aluno_id ORDER BY x.data_hora DESC LIMIT 8`).all(),
      semProfessor: db.prepare(`
        SELECT t.nome AS turma, d.nome AS disciplina FROM turma_disciplinas td
        JOIN turmas t ON t.id = td.turma_id JOIN disciplinas d ON d.id = td.disciplina_id
        WHERE td.professor_id IS NULL AND t.ativo = 1 ORDER BY t.nome LIMIT 20`).all(),
    });
  } else {
    res.json({ turmas: turmasDoProfessor(req.user.id) });
  }
}));

function turmasDoProfessor(profId) {
  return db.prepare(`
    SELECT t.id AS turma_id, t.nome AS turma, t.serie, t.turno, t.ano_letivo, d.id AS disciplina_id, d.nome AS disciplina,
      (SELECT COUNT(*) FROM matriculas m WHERE m.turma_id = t.id AND m.situacao = 'cursando') AS alunos,
      (SELECT MAX(data) FROM aulas a WHERE a.turma_id = t.id AND a.disciplina_id = d.id) AS ultima_aula
    FROM turma_disciplinas td JOIN turmas t ON t.id = td.turma_id JOIN disciplinas d ON d.id = td.disciplina_id
    WHERE td.professor_id = ? AND t.ativo = 1 ORDER BY t.nome, d.ordem, d.nome`).all(profId);
}

/* ---------------- Disciplinas ---------------- */
const DISC = ['nome', 'carga_horaria', 'ordem'];
r.get('/disciplinas', (req, res) => res.json(db.prepare('SELECT * FROM disciplinas ORDER BY ordem, nome').all()));
r.post('/disciplinas', gestor, wrap((req, res) => res.json({ id: insert('disciplinas', pickFields(req.body, DISC)) })));
r.put('/disciplinas/:id', gestor, wrap((req, res) => { update('disciplinas', req.params.id, pickFields(req.body, DISC)); res.json({ ok: true }); }));
r.delete('/disciplinas/:id', gestor, wrap((req, res) => { db.prepare('DELETE FROM disciplinas WHERE id = ?').run(req.params.id); res.json({ ok: true }); }));

/* ---------------- Professores ---------------- */
r.get('/professores', gestor, wrap((req, res) => {
  const profs = db.prepare("SELECT id, nome, email, telefone, ativo FROM usuarios WHERE papel = 'professor' ORDER BY ativo DESC, nome").all();
  const atrib = db.prepare(`
    SELECT td.professor_id, t.id AS turma_id, t.nome AS turma, d.nome AS disciplina FROM turma_disciplinas td
    JOIN turmas t ON t.id = td.turma_id JOIN disciplinas d ON d.id = td.disciplina_id
    WHERE td.professor_id IS NOT NULL AND t.ativo = 1 ORDER BY t.nome, d.nome`).all();
  res.json(profs.map((p) => ({ ...p, atribuicoes: atrib.filter((a) => a.professor_id === p.id) })));
}));
r.post('/professores', gestor, wrap((req, res) => {
  const { nome, email, telefone, senha } = req.body || {};
  if (!nome || !email || !senha || senha.length < 6) return res.status(400).json({ erro: 'Informe nome, e-mail e senha (mín. 6 caracteres)' });
  res.json({ id: insert('usuarios', { nome, email: email.trim().toLowerCase(), telefone: telefone || null, senha_hash: hashSenha(senha), papel: 'professor' }) });
}));
r.put('/professores/:id', gestor, wrap((req, res) => {
  const d = pickFields(req.body, ['nome', 'telefone', 'ativo']);
  if (req.body.email) d.email = req.body.email.trim().toLowerCase();
  if (req.body.senha) {
    if (req.body.senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter ao menos 6 caracteres' });
    d.senha_hash = hashSenha(req.body.senha);
  }
  db.prepare("SELECT 1 FROM usuarios WHERE id = ? AND papel = 'professor'").get(req.params.id) && update('usuarios', req.params.id, d);
  res.json({ ok: true });
}));
/** Define de uma vez as turmas/disciplinas do professor: [{turma_id, disciplina_id}] */
r.put('/professores/:id/atribuicoes', gestor, wrap((req, res) => {
  const id = Number(req.params.id);
  transaction(() => {
    db.prepare('UPDATE turma_disciplinas SET professor_id = NULL WHERE professor_id = ?').run(id);
    const up = db.prepare(`INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id) VALUES (?, ?, ?)
      ON CONFLICT(turma_id, disciplina_id) DO UPDATE SET professor_id = excluded.professor_id`);
    for (const a of req.body || []) up.run(a.turma_id, a.disciplina_id, id);
  });
  res.json({ ok: true });
}));

/* ---------------- Turmas ---------------- */
const TURMA = ['nome', 'serie', 'nivel', 'turno', 'ano_letivo', 'ativo'];
r.get('/turmas', wrap((req, res) => {
  if (req.user.papel === 'professor') return res.json(turmasDoProfessor(req.user.id));
  const ano = req.query.ano;
  res.json(db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM matriculas m WHERE m.turma_id = t.id AND m.situacao = 'cursando') AS alunos,
      (SELECT COUNT(*) FROM turma_disciplinas td WHERE td.turma_id = t.id) AS disciplinas
    FROM turmas t ${ano ? 'WHERE t.ano_letivo = ?' : ''} ORDER BY t.ativo DESC, t.ano_letivo DESC, t.nome`).all(...(ano ? [ano] : [])));
}));
r.get('/turmas/:id', wrap((req, res) => {
  if (!podeAcessar(req.user, req.params.id)) return res.status(403).json({ erro: 'Sem acesso a esta turma' });
  const t = db.prepare('SELECT * FROM turmas WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ erro: 'Turma não encontrada' });
  t.disciplinas = db.prepare(`
    SELECT d.id, d.nome, td.professor_id, u.nome AS professor FROM turma_disciplinas td
    JOIN disciplinas d ON d.id = td.disciplina_id LEFT JOIN usuarios u ON u.id = td.professor_id
    WHERE td.turma_id = ? ORDER BY d.ordem, d.nome`).all(t.id);
  t.alunos = matriculasDaTurma(t.id);
  res.json(t);
}));
r.post('/turmas', gestor, wrap((req, res) => {
  const d = pickFields(req.body, TURMA);
  d.ano_letivo ||= Number(getConfig().ano_letivo);
  const id = transaction(() => {
    const id = insert('turmas', d);
    // por padrão a turma recebe todas as disciplinas cadastradas
    const discs = req.body.disciplinas ?? db.prepare('SELECT id FROM disciplinas').all().map((x) => x.id);
    const ins = db.prepare('INSERT INTO turma_disciplinas (turma_id, disciplina_id) VALUES (?, ?)');
    for (const dId of discs) ins.run(id, dId);
    return id;
  });
  res.json({ id });
}));
r.put('/turmas/:id', gestor, wrap((req, res) => { update('turmas', req.params.id, pickFields(req.body, TURMA)); res.json({ ok: true }); }));
r.delete('/turmas/:id', gestor, wrap((req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM matriculas WHERE turma_id = ?').get(req.params.id).n;
  if (n) return res.status(409).json({ erro: 'Turma possui alunos matriculados. Inative-a em vez de excluir.' });
  db.prepare('DELETE FROM turmas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));
/** Grade da turma: [{disciplina_id, professor_id}] */
r.put('/turmas/:id/disciplinas', gestor, wrap((req, res) => {
  const id = Number(req.params.id);
  transaction(() => {
    const atuais = db.prepare('SELECT disciplina_id FROM turma_disciplinas WHERE turma_id = ?').all(id).map((x) => x.disciplina_id);
    const novas = (req.body || []).map((x) => Number(x.disciplina_id));
    for (const d of atuais.filter((d) => !novas.includes(d))) {
      db.prepare('DELETE FROM turma_disciplinas WHERE turma_id = ? AND disciplina_id = ?').run(id, d);
    }
    const up = db.prepare(`INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id) VALUES (?, ?, ?)
      ON CONFLICT(turma_id, disciplina_id) DO UPDATE SET professor_id = excluded.professor_id`);
    for (const x of req.body || []) up.run(id, x.disciplina_id, x.professor_id || null);
  });
  res.json({ ok: true });
}));
r.post('/turmas/:id/alunos', gestor, wrap((req, res) => {
  const ids = Array.isArray(req.body.aluno_ids) ? req.body.aluno_ids : [req.body.aluno_id];
  transaction(() => {
    const max = () => db.prepare('SELECT COALESCE(MAX(numero), 0) n FROM matriculas WHERE turma_id = ?').get(req.params.id).n;
    const ins = db.prepare('INSERT OR IGNORE INTO matriculas (aluno_id, turma_id, numero) VALUES (?, ?, ?)');
    for (const a of ids) ins.run(a, req.params.id, max() + 1);
  });
  res.json({ ok: true });
}));
/** Renumera a chamada em ordem alfabética */
r.post('/turmas/:id/renumerar', gestor, wrap((req, res) => {
  transaction(() => {
    const ms = db.prepare(`SELECT m.id FROM matriculas m JOIN alunos a ON a.id = m.aluno_id
      WHERE m.turma_id = ? ORDER BY a.nome`).all(req.params.id);
    ms.forEach((m, i) => db.prepare('UPDATE matriculas SET numero = ? WHERE id = ?').run(i + 1, m.id));
  });
  res.json({ ok: true });
}));

/* ---------------- Matrículas ---------------- */
r.put('/matriculas/:id', gestor, wrap((req, res) => {
  update('matriculas', req.params.id, pickFields(req.body, ['numero', 'situacao', 'data_matricula']));
  res.json({ ok: true });
}));
r.delete('/matriculas/:id', gestor, wrap((req, res) => {
  const temDados = db.prepare(`SELECT (SELECT COUNT(*) FROM notas WHERE matricula_id = ?) + (SELECT COUNT(*) FROM frequencias WHERE matricula_id = ?) n`)
    .get(req.params.id, req.params.id).n;
  if (temDados && !req.query.forcar) {
    return res.status(409).json({ erro: 'Matrícula possui notas/frequência lançadas. Altere a situação para "transferido" ou "remanejado" em vez de excluir.' });
  }
  db.prepare('DELETE FROM matriculas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

/* ---------------- Alunos ---------------- */
const ALUNO = ['nome', 'matricula', 'data_nascimento', 'sexo', 'cpf', 'rg', 'naturalidade', 'uf_naturalidade', 'nacionalidade',
  'nome_mae', 'nome_pai', 'responsavel', 'telefone', 'email', 'endereco', 'observacoes', 'ativo'];

r.get('/alunos', gestor, wrap((req, res) => {
  const where = [], p = [];
  if (req.query.q) { where.push('(a.nome LIKE ? OR a.matricula LIKE ? OR a.cpf LIKE ?)'); p.push(...Array(3).fill(`%${req.query.q}%`)); }
  if (req.query.turma_id) { where.push('EXISTS (SELECT 1 FROM matriculas m WHERE m.aluno_id = a.id AND m.turma_id = ?)'); p.push(req.query.turma_id); }
  if (req.query.ativo !== 'todos') where.push('a.ativo = 1');
  res.json(db.prepare(`
    SELECT a.id, a.nome, a.matricula, a.data_nascimento, a.responsavel, a.telefone, a.foto, a.ativo, a.bloqueado, a.catraca_sync, a.catraca_erro,
      (SELECT t.nome FROM matriculas m JOIN turmas t ON t.id = m.turma_id WHERE m.aluno_id = a.id ORDER BY t.ano_letivo DESC, m.id DESC LIMIT 1) AS turma
    FROM alunos a ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.nome LIMIT 1000`).all(...p));
}));
r.get('/alunos/:id', gestor, wrap((req, res) => {
  const a = db.prepare('SELECT * FROM alunos WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ erro: 'Aluno não encontrado' });
  a.matriculas = db.prepare(`SELECT m.*, t.nome AS turma, t.serie, t.ano_letivo, t.turno FROM matriculas m
    JOIN turmas t ON t.id = m.turma_id WHERE m.aluno_id = ? ORDER BY t.ano_letivo DESC`).all(a.id);
  a.historico_externo = db.prepare('SELECT * FROM historico_externo WHERE aluno_id = ? ORDER BY ano_letivo, disciplina').all(a.id);
  res.json(a);
}));
function proximaMatricula() {
  const ano = getConfig().ano_letivo;
  const ult = db.prepare("SELECT matricula FROM alunos WHERE matricula LIKE ? ORDER BY matricula DESC LIMIT 1").get(`${ano}%`);
  const seq = ult ? Number(String(ult.matricula).slice(String(ano).length)) + 1 : 1;
  return `${ano}${String(seq).padStart(4, '0')}`;
}
r.post('/alunos', gestor, wrap((req, res) => {
  const d = pickFields(req.body, ALUNO);
  if (!d.nome) return res.status(400).json({ erro: 'Informe o nome do aluno' });
  d.matricula ||= proximaMatricula();
  const id = transaction(() => {
    const id = insert('alunos', d);
    if (req.body.turma_id) {
      const n = db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 n FROM matriculas WHERE turma_id = ?').get(req.body.turma_id).n;
      db.prepare('INSERT INTO matriculas (aluno_id, turma_id, numero) VALUES (?, ?, ?)').run(id, req.body.turma_id, n);
    }
    return id;
  });
  res.json({ id });
}));
r.put('/alunos/:id', gestor, wrap((req, res) => { update('alunos', req.params.id, pickFields(req.body, ALUNO)); res.json({ ok: true }); }));
r.delete('/alunos/:id', gestor, wrap((req, res) => {
  db.prepare('UPDATE alunos SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));
r.post('/alunos/:id/foto', gestor, express.raw({ type: ['image/jpeg', 'application/octet-stream'], limit: '5mb' }), wrap((req, res) => {
  if (!req.body?.length) return res.status(400).json({ erro: 'Imagem vazia' });
  fs.writeFileSync(path.join(FOTOS_DIR, `${Number(req.params.id)}.jpg`), req.body);
  db.prepare('UPDATE alunos SET foto = 1, catraca_sync = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));
r.get('/alunos/:id/foto', (req, res) => {
  const f = path.join(FOTOS_DIR, `${Number(req.params.id)}.jpg`);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(f);
});

/* ---------------- Histórico externo (anos cursados em outras escolas) ---------------- */
r.post('/alunos/:id/historico', gestor, wrap((req, res) => {
  const linhas = Array.isArray(req.body) ? req.body : [req.body];
  transaction(() => {
    for (const l of linhas) {
      insert('historico_externo', {
        aluno_id: Number(req.params.id),
        ...pickFields(l, ['ano_letivo', 'serie', 'escola', 'cidade_uf', 'disciplina', 'nota', 'carga_horaria', 'resultado']),
      });
    }
  });
  res.json({ ok: true });
}));
r.delete('/historico/:id', gestor, wrap((req, res) => {
  db.prepare('DELETE FROM historico_externo WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

export default r;
export { wrap };
