import { Router } from 'express';
import express from 'express';
import { db, getConfig, limparCacheConfig, transaction } from '../db.js';
import { gestor, podeAcessar, hashSenha, conferirSenha } from '../auth.js';
import { matriculasDaTurma } from '../calc.js';

const r = Router();

const pickFields = (body, fields) => {
  const out = {};
  for (const f of fields) if (f in (body || {})) out[f] = body[f] === '' ? null : body[f];
  return out;
};
async function insert(table, data) {
  const keys = Object.keys(data);
  const { rows } = await db.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING id`,
    ...keys.map((k) => data[k]));
  return rows[0].id;
}
async function update(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  await db.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ?`, ...keys.map((k) => data[k]), id);
}
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Registro duplicado (já existe um cadastro com esses dados).' });
    if (e.code === '23503') return res.status(409).json({ erro: 'Registro em uso; não pode ser removido.' });
    if (e.status) return res.status(e.status).json({ erro: e.message });
    console.error(e);
    res.status(500).json({ erro: String(e.message || e) });
  }
};

/* ---------------- Usuário logado ---------------- */
r.get('/auth/me', (req, res) => res.json(req.user));
r.post('/auth/senha', wrap(async (req, res) => {
  const u = await db.get('SELECT * FROM usuarios WHERE id = ?', req.user.id);
  if (!conferirSenha(String(req.body.atual || ''), u.senha_hash)) return res.status(400).json({ erro: 'Senha atual incorreta' });
  if (String(req.body.nova || '').length < 6) return res.status(400).json({ erro: 'A nova senha deve ter ao menos 6 caracteres' });
  await db.run('UPDATE usuarios SET senha_hash = ? WHERE id = ?', hashSenha(req.body.nova), u.id);
  res.json({ ok: true });
}));

/* ---------------- Configuração ---------------- */
r.get('/config', wrap(async (req, res) => res.json(await getConfig())));
r.put('/config', gestor, wrap(async (req, res) => {
  await transaction(async () => {
    for (const [k, v] of Object.entries(req.body || {})) {
      await db.run('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor',
        k, v == null ? '' : String(v));
    }
  });
  limparCacheConfig();
  res.json(await getConfig());
}));

/* ---------------- Painel ---------------- */
r.get('/dashboard', wrap(async (req, res) => {
  const hoje = new Date().toLocaleDateString('sv-SE');
  if (req.user.papel !== 'gestor') return res.json({ turmas: await turmasDoProfessor(req.user.id) });

  const cfg = await getConfig();
  const media = Number(cfg.media_aprovacao) || 6;
  const freqMin = Number(cfg.frequencia_minima) || 75;
  const c = async (sql, ...p) => (await db.get(sql, ...p)).n;

  // últimos 10 dias úteis (seg–sex), do mais antigo para o mais recente
  const dias = [];
  for (const d = new Date(); dias.length < 10; d.setDate(d.getDate() - 1)) {
    if (d.getDay() % 6) dias.unshift(d.toLocaleDateString('sv-SE'));
  }

  const [alunos, turmasAtivas, professores, semTurma, aulasHoje, entradas, frequenciaDiaria, porMatricula, ultimosAcessos, semProfessor] = await Promise.all([
    c('SELECT COUNT(*) n FROM alunos WHERE ativo = 1'),
    c('SELECT COUNT(*) n FROM turmas WHERE ativo = 1'),
    c("SELECT COUNT(*) n FROM usuarios WHERE papel = 'professor' AND ativo = 1"),
    c('SELECT COUNT(*) n FROM alunos a WHERE ativo = 1 AND NOT EXISTS (SELECT 1 FROM matriculas m JOIN turmas t ON t.id = m.turma_id WHERE m.aluno_id = a.id AND t.ativo = 1)'),
    c('SELECT COUNT(*) n FROM aulas WHERE data = ?', hoje),
    db.all(`
      SELECT substr(data_hora,1,10) AS dia, COUNT(DISTINCT aluno_id) AS n FROM acessos
      WHERE tipo = 'entrada' AND aluno_id IS NOT NULL AND substr(data_hora,1,10) >= ? GROUP BY 1`, dias[0]),
    // frequência por dia letivo (diário de classe), ponderada pela quantidade de aulas
    db.all(`
      SELECT a.data AS dia, ROUND(100.0 * SUM(CASE WHEN f.presente = 1 THEN a.quantidade ELSE 0 END) / SUM(a.quantidade), 1) AS pct
      FROM frequencias f JOIN aulas a ON a.id = f.aula_id
      GROUP BY a.data ORDER BY a.data DESC LIMIT 30`),
    // indicadores por matrícula ativa: média das notas lançadas e frequência
    db.all(`
      SELECT m.id, al.id AS aluno_id, al.nome, t.id AS turma_id, t.nome AS turma, nt.media, fq.freq
      FROM matriculas m JOIN turmas t ON t.id = m.turma_id JOIN alunos al ON al.id = m.aluno_id
      LEFT JOIN (
        SELECT matricula_id, AVG(GREATEST(COALESCE(nota, 0), COALESCE(recuperacao, 0))) AS media FROM notas
        WHERE bimestre <= 4 AND (nota IS NOT NULL OR recuperacao IS NOT NULL) GROUP BY matricula_id
      ) nt ON nt.matricula_id = m.id
      LEFT JOIN (
        SELECT f.matricula_id, 100.0 * SUM(CASE WHEN f.presente = 1 THEN a.quantidade ELSE 0 END) / NULLIF(SUM(a.quantidade), 0) AS freq
        FROM frequencias f JOIN aulas a ON a.id = f.aula_id GROUP BY f.matricula_id
      ) fq ON fq.matricula_id = m.id
      WHERE m.situacao = 'cursando' AND t.ativo = 1 AND al.ativo = 1`),
    db.all(`
      SELECT x.id, x.data_hora, x.tipo, x.aluno_id, a.nome AS aluno FROM acessos x
      LEFT JOIN alunos a ON a.id = x.aluno_id ORDER BY x.data_hora DESC LIMIT 8`),
    db.all(`
      SELECT t.nome AS turma, d.nome AS disciplina FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id JOIN disciplinas d ON d.id = td.disciplina_id
      WHERE td.professor_id IS NULL AND t.ativo = 1 ORDER BY t.nome LIMIT 20`),
  ]);
  const entradasDia = new Map(entradas.map((x) => [x.dia, x.n]));

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
    alunos, turmasAtivas, professores, semTurma, aulasHoje,
    entradasHoje: entradasDia.get(hoje) || 0,
    frequenciaGeral: r1(avg(porMatricula.map((m) => m.freq))),
    mediaGeral: r1(avg(porMatricula.map((m) => m.media))),
    mediaAprovacao: media,
    frequenciaMinima: freqMin,
    entradasDias: dias.map((dia) => ({ dia, n: entradasDia.get(dia) || 0 })),
    frequenciaDiaria: frequenciaDiaria.reverse(),
    desempenho, turmas, emAtencao, ultimosAcessos, semProfessor,
  });
}));

function turmasDoProfessor(profId) {
  return db.all(`
    SELECT t.id AS turma_id, t.nome AS turma, t.serie, t.turno, t.ano_letivo, d.id AS disciplina_id, d.nome AS disciplina,
      (SELECT COUNT(*) FROM matriculas m WHERE m.turma_id = t.id AND m.situacao = 'cursando') AS alunos,
      (SELECT MAX(data) FROM aulas a WHERE a.turma_id = t.id AND a.disciplina_id = d.id) AS ultima_aula
    FROM turma_disciplinas td JOIN turmas t ON t.id = td.turma_id JOIN disciplinas d ON d.id = td.disciplina_id
    WHERE td.professor_id = ? AND t.ativo = 1 ORDER BY t.nome, d.ordem, d.nome`, profId);
}

/* ---------------- Disciplinas ---------------- */
const DISC = ['nome', 'carga_horaria', 'ordem'];
r.get('/disciplinas', wrap(async (req, res) => res.json(await db.all('SELECT * FROM disciplinas ORDER BY ordem, nome'))));
r.post('/disciplinas', gestor, wrap(async (req, res) => res.json({ id: await insert('disciplinas', pickFields(req.body, DISC)) })));
r.put('/disciplinas/:id', gestor, wrap(async (req, res) => { await update('disciplinas', req.params.id, pickFields(req.body, DISC)); res.json({ ok: true }); }));
r.delete('/disciplinas/:id', gestor, wrap(async (req, res) => { await db.run('DELETE FROM disciplinas WHERE id = ?', req.params.id); res.json({ ok: true }); }));

/* ---------------- Professores ---------------- */
r.get('/professores', gestor, wrap(async (req, res) => {
  const [profs, atrib] = await Promise.all([
    db.all("SELECT id, nome, email, telefone, ativo FROM usuarios WHERE papel = 'professor' ORDER BY ativo DESC, nome"),
    db.all(`
      SELECT td.professor_id, t.id AS turma_id, t.nome AS turma, d.nome AS disciplina FROM turma_disciplinas td
      JOIN turmas t ON t.id = td.turma_id JOIN disciplinas d ON d.id = td.disciplina_id
      WHERE td.professor_id IS NOT NULL AND t.ativo = 1 ORDER BY t.nome, d.nome`),
  ]);
  res.json(profs.map((p) => ({ ...p, atribuicoes: atrib.filter((a) => a.professor_id === p.id) })));
}));
r.post('/professores', gestor, wrap(async (req, res) => {
  const { nome, email, telefone, senha } = req.body || {};
  if (!nome || !email || !senha || senha.length < 6) return res.status(400).json({ erro: 'Informe nome, e-mail e senha (mín. 6 caracteres)' });
  res.json({ id: await insert('usuarios', { nome, email: email.trim().toLowerCase(), telefone: telefone || null, senha_hash: hashSenha(senha), papel: 'professor' }) });
}));
r.put('/professores/:id', gestor, wrap(async (req, res) => {
  const d = pickFields(req.body, ['nome', 'telefone', 'ativo']);
  if (req.body.email) d.email = req.body.email.trim().toLowerCase();
  if (req.body.senha) {
    if (req.body.senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter ao menos 6 caracteres' });
    d.senha_hash = hashSenha(req.body.senha);
  }
  if (await db.get("SELECT 1 FROM usuarios WHERE id = ? AND papel = 'professor'", req.params.id)) await update('usuarios', req.params.id, d);
  res.json({ ok: true });
}));
const UPSERT_TD = `INSERT INTO turma_disciplinas (turma_id, disciplina_id, professor_id) VALUES (?, ?, ?)
  ON CONFLICT (turma_id, disciplina_id) DO UPDATE SET professor_id = excluded.professor_id`;
/** Define de uma vez as turmas/disciplinas do professor: [{turma_id, disciplina_id}] */
r.put('/professores/:id/atribuicoes', gestor, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await transaction(async () => {
    await db.run('UPDATE turma_disciplinas SET professor_id = NULL WHERE professor_id = ?', id);
    for (const a of req.body || []) await db.run(UPSERT_TD, a.turma_id, a.disciplina_id, id);
  });
  res.json({ ok: true });
}));

/* ---------------- Turmas ---------------- */
const TURMA = ['nome', 'serie', 'nivel', 'turno', 'ano_letivo', 'ativo'];
r.get('/turmas', wrap(async (req, res) => {
  if (req.user.papel === 'professor') return res.json(await turmasDoProfessor(req.user.id));
  const ano = req.query.ano;
  res.json(await db.all(`
    SELECT t.*, (SELECT COUNT(*) FROM matriculas m WHERE m.turma_id = t.id AND m.situacao = 'cursando') AS alunos,
      (SELECT COUNT(*) FROM turma_disciplinas td WHERE td.turma_id = t.id) AS disciplinas
    FROM turmas t ${ano ? 'WHERE t.ano_letivo = ?' : ''} ORDER BY t.ativo DESC, t.ano_letivo DESC, t.nome`, ...(ano ? [ano] : [])));
}));
r.get('/turmas/:id', wrap(async (req, res) => {
  if (!(await podeAcessar(req.user, req.params.id))) return res.status(403).json({ erro: 'Sem acesso a esta turma' });
  const [t, disciplinas, alunos] = await Promise.all([
    db.get('SELECT * FROM turmas WHERE id = ?', req.params.id),
    db.all(`
      SELECT d.id, d.nome, td.professor_id, u.nome AS professor FROM turma_disciplinas td
      JOIN disciplinas d ON d.id = td.disciplina_id LEFT JOIN usuarios u ON u.id = td.professor_id
      WHERE td.turma_id = ? ORDER BY d.ordem, d.nome`, req.params.id),
    matriculasDaTurma(req.params.id),
  ]);
  if (!t) return res.status(404).json({ erro: 'Turma não encontrada' });
  res.json({ ...t, disciplinas, alunos });
}));
r.post('/turmas', gestor, wrap(async (req, res) => {
  const d = pickFields(req.body, TURMA);
  d.ano_letivo ||= Number((await getConfig()).ano_letivo);
  const id = await transaction(async () => {
    const id = await insert('turmas', d);
    // por padrão a turma recebe todas as disciplinas cadastradas
    const discs = req.body.disciplinas ?? (await db.all('SELECT id FROM disciplinas')).map((x) => x.id);
    for (const dId of discs) await db.run('INSERT INTO turma_disciplinas (turma_id, disciplina_id) VALUES (?, ?)', id, dId);
    return id;
  });
  res.json({ id });
}));
r.put('/turmas/:id', gestor, wrap(async (req, res) => { await update('turmas', req.params.id, pickFields(req.body, TURMA)); res.json({ ok: true }); }));
r.delete('/turmas/:id', gestor, wrap(async (req, res) => {
  const { n } = await db.get('SELECT COUNT(*) n FROM matriculas WHERE turma_id = ?', req.params.id);
  if (n) return res.status(409).json({ erro: 'Turma possui alunos matriculados. Inative-a em vez de excluir.' });
  await db.run('DELETE FROM turmas WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));
/** Grade da turma: [{disciplina_id, professor_id}] */
r.put('/turmas/:id/disciplinas', gestor, wrap(async (req, res) => {
  const id = Number(req.params.id);
  await transaction(async () => {
    const atuais = (await db.all('SELECT disciplina_id FROM turma_disciplinas WHERE turma_id = ?', id)).map((x) => x.disciplina_id);
    const novas = (req.body || []).map((x) => Number(x.disciplina_id));
    for (const d of atuais.filter((d) => !novas.includes(d))) {
      await db.run('DELETE FROM turma_disciplinas WHERE turma_id = ? AND disciplina_id = ?', id, d);
    }
    for (const x of req.body || []) await db.run(UPSERT_TD, id, x.disciplina_id, x.professor_id || null);
  });
  res.json({ ok: true });
}));
r.post('/turmas/:id/alunos', gestor, wrap(async (req, res) => {
  const ids = Array.isArray(req.body.aluno_ids) ? req.body.aluno_ids : [req.body.aluno_id];
  await transaction(async () => {
    for (const a of ids) {
      await db.run(`INSERT INTO matriculas (aluno_id, turma_id, numero)
        VALUES (?, ?, (SELECT COALESCE(MAX(numero), 0) + 1 FROM matriculas WHERE turma_id = ?)) ON CONFLICT DO NOTHING`,
      a, req.params.id, req.params.id);
    }
  });
  res.json({ ok: true });
}));
/** Renumera a chamada em ordem alfabética */
r.post('/turmas/:id/renumerar', gestor, wrap(async (req, res) => {
  await db.run(`
    UPDATE matriculas m SET numero = o.n FROM (
      SELECT m2.id, ROW_NUMBER() OVER (ORDER BY a.nome) AS n FROM matriculas m2 JOIN alunos a ON a.id = m2.aluno_id WHERE m2.turma_id = ?
    ) o WHERE o.id = m.id`, req.params.id);
  res.json({ ok: true });
}));

/* ---------------- Matrículas ---------------- */
r.put('/matriculas/:id', gestor, wrap(async (req, res) => {
  await update('matriculas', req.params.id, pickFields(req.body, ['numero', 'situacao', 'data_matricula']));
  res.json({ ok: true });
}));
r.delete('/matriculas/:id', gestor, wrap(async (req, res) => {
  const { n } = await db.get(`SELECT (SELECT COUNT(*) FROM notas WHERE matricula_id = ?) + (SELECT COUNT(*) FROM frequencias WHERE matricula_id = ?) n`,
    req.params.id, req.params.id);
  if (n && !req.query.forcar) {
    return res.status(409).json({ erro: 'Matrícula possui notas/frequência lançadas. Altere a situação para "transferido" ou "remanejado" em vez de excluir.' });
  }
  await db.run('DELETE FROM matriculas WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

/* ---------------- Alunos ---------------- */
const ALUNO = ['nome', 'matricula', 'data_nascimento', 'sexo', 'cpf', 'rg', 'naturalidade', 'uf_naturalidade', 'nacionalidade',
  'nome_mae', 'nome_pai', 'responsavel', 'telefone', 'email', 'endereco', 'observacoes', 'ativo'];

r.get('/alunos', gestor, wrap(async (req, res) => {
  const where = [], p = [];
  if (req.query.q) { where.push('(a.nome ILIKE ? OR a.matricula ILIKE ? OR a.cpf ILIKE ?)'); p.push(...Array(3).fill(`%${req.query.q}%`)); }
  if (req.query.turma_id) { where.push('EXISTS (SELECT 1 FROM matriculas m WHERE m.aluno_id = a.id AND m.turma_id = ?)'); p.push(req.query.turma_id); }
  if (req.query.ativo !== 'todos') where.push('a.ativo = 1');
  res.json(await db.all(`
    SELECT a.id, a.nome, a.matricula, a.data_nascimento, a.responsavel, a.telefone, a.foto, a.ativo, a.bloqueado, a.catraca_sync, a.catraca_erro,
      (SELECT t.nome FROM matriculas m JOIN turmas t ON t.id = m.turma_id WHERE m.aluno_id = a.id ORDER BY t.ano_letivo DESC, m.id DESC LIMIT 1) AS turma
    FROM alunos a ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.nome LIMIT 1000`, ...p));
}));
r.get('/alunos/:id', gestor, wrap(async (req, res) => {
  const [a, matriculas, historico_externo] = await Promise.all([
    db.get('SELECT * FROM alunos WHERE id = ?', req.params.id),
    db.all(`SELECT m.*, t.nome AS turma, t.serie, t.ano_letivo, t.turno FROM matriculas m
      JOIN turmas t ON t.id = m.turma_id WHERE m.aluno_id = ? ORDER BY t.ano_letivo DESC`, req.params.id),
    db.all('SELECT * FROM historico_externo WHERE aluno_id = ? ORDER BY ano_letivo, disciplina', req.params.id),
  ]);
  if (!a) return res.status(404).json({ erro: 'Aluno não encontrado' });
  res.json({ ...a, matriculas, historico_externo });
}));
async function proximaMatricula() {
  const ano = (await getConfig()).ano_letivo;
  const ult = await db.get('SELECT matricula FROM alunos WHERE matricula LIKE ? ORDER BY matricula DESC LIMIT 1', `${ano}%`);
  const seq = ult ? Number(String(ult.matricula).slice(String(ano).length)) + 1 : 1;
  return `${ano}${String(seq).padStart(4, '0')}`;
}
r.post('/alunos', gestor, wrap(async (req, res) => {
  const d = pickFields(req.body, ALUNO);
  if (!d.nome) return res.status(400).json({ erro: 'Informe o nome do aluno' });
  d.matricula ||= await proximaMatricula();
  const id = await transaction(async () => {
    const id = await insert('alunos', d);
    if (req.body.turma_id) {
      await db.run(`INSERT INTO matriculas (aluno_id, turma_id, numero)
        VALUES (?, ?, (SELECT COALESCE(MAX(numero), 0) + 1 FROM matriculas WHERE turma_id = ?))`, id, req.body.turma_id, req.body.turma_id);
    }
    return id;
  });
  res.json({ id });
}));
r.put('/alunos/:id', gestor, wrap(async (req, res) => { await update('alunos', req.params.id, pickFields(req.body, ALUNO)); res.json({ ok: true }); }));
r.delete('/alunos/:id', gestor, wrap(async (req, res) => {
  await db.run('UPDATE alunos SET ativo = 0 WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));
r.post('/alunos/:id/foto', gestor, express.raw({ type: ['image/jpeg', 'application/octet-stream'], limit: '5mb' }), wrap(async (req, res) => {
  if (!req.body?.length) return res.status(400).json({ erro: 'Imagem vazia' });
  await transaction(async () => {
    await db.run('INSERT INTO fotos (aluno_id, dados) VALUES (?, ?) ON CONFLICT (aluno_id) DO UPDATE SET dados = excluded.dados',
      req.params.id, req.body);
    await db.run('UPDATE alunos SET foto = 1, catraca_sync = NULL WHERE id = ?', req.params.id);
  });
  res.json({ ok: true });
}));
r.get('/alunos/:id/foto', wrap(async (req, res) => {
  const f = await db.get('SELECT dados FROM fotos WHERE aluno_id = ?', Number(req.params.id) || 0);
  if (!f) return res.status(404).end();
  res.setHeader('Cache-Control', 'no-cache');
  res.type('jpeg').send(f.dados);
}));

/* ---------------- Histórico externo (anos cursados em outras escolas) ---------------- */
r.post('/alunos/:id/historico', gestor, wrap(async (req, res) => {
  const linhas = Array.isArray(req.body) ? req.body : [req.body];
  await transaction(async () => {
    for (const l of linhas) {
      await insert('historico_externo', {
        aluno_id: Number(req.params.id),
        ...pickFields(l, ['ano_letivo', 'serie', 'escola', 'cidade_uf', 'disciplina', 'nota', 'carga_horaria', 'resultado']),
      });
    }
  });
  res.json({ ok: true });
}));
r.delete('/historico/:id', gestor, wrap(async (req, res) => {
  await db.run('DELETE FROM historico_externo WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

export default r;
export { wrap };
