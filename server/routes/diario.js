import { Router } from 'express';
import { db, getConfig, transaction, AGORA } from '../db.js';
import { podeAcessar } from '../auth.js';
import { matriculasDaTurma, boletim } from '../calc.js';
import { wrap } from './cadastros.js';

const r = Router();

async function checar(req, res, src) {
  const turmaId = Number(src.turma_id), discId = Number(src.disciplina_id);
  if (!turmaId || !discId) { res.status(400).json({ erro: 'Informe turma e disciplina' }); return null; }
  if (!(await podeAcessar(req.user, turmaId, discId))) { res.status(403).json({ erro: 'Você não leciona esta disciplina nesta turma' }); return null; }
  return { turmaId, discId };
}

const nota = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  if (Number.isNaN(n) || n < 0 || n > 10) throw Object.assign(new Error(`Nota inválida: ${v} (use 0 a 10)`), { status: 400 });
  return n;
};

/* ---------------- Notas ---------------- */
r.get('/notas', wrap(async (req, res) => {
  const ok = await checar(req, res, req.query); if (!ok) return;
  const [notas, cfg, mats] = await Promise.all([
    db.all(`SELECT n.* FROM notas n JOIN matriculas m ON m.id = n.matricula_id
      WHERE m.turma_id = ? AND n.disciplina_id = ?`, ok.turmaId, ok.discId),
    getConfig(),
    matriculasDaTurma(ok.turmaId),
  ]);
  const alunos = await Promise.all(mats.map(async (m) => {
    const b = (await boletim(m.id, cfg)).disciplinas.find((d) => d.disciplina_id === ok.discId);
    const porBim = {};
    for (const n of notas.filter((n) => n.matricula_id === m.id)) porBim[n.bimestre] = { nota: n.nota, recuperacao: n.recuperacao };
    return { ...m, notas: porBim, mediaParcial: b?.mediaParcial, mediaFinal: b?.mediaFinal, faltas: b?.faltas, situacaoDisc: b?.situacao };
  }));
  res.json({ alunos, media: Number(cfg.media_aprovacao) });
}));

r.put('/notas', wrap(async (req, res) => {
  const ok = await checar(req, res, req.body); if (!ok) return;
  const bim = Number(req.body.bimestre);
  if (!(bim >= 1 && bim <= 5)) return res.status(400).json({ erro: 'Bimestre inválido' });
  const validas = new Set((await matriculasDaTurma(ok.turmaId)).map((m) => m.id));
  const lancs = (req.body.lancamentos || [])
    .filter((l) => validas.has(Number(l.matricula_id)))
    .map((l) => [l.matricula_id, ok.discId, bim, nota(l.nota), bim === 5 ? null : nota(l.recuperacao)]);
  await transaction(async () => {
    for (const l of lancs) {
      await db.run(`INSERT INTO notas (matricula_id, disciplina_id, bimestre, nota, recuperacao, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ${AGORA})
        ON CONFLICT (matricula_id, disciplina_id, bimestre) DO UPDATE SET nota = excluded.nota, recuperacao = excluded.recuperacao, atualizado_em = ${AGORA}`, ...l);
    }
  });
  res.json({ ok: true });
}));

/* ---------------- Frequência ---------------- */
r.get('/aulas', wrap(async (req, res) => {
  const ok = await checar(req, res, req.query); if (!ok) return;
  res.json(await db.all(`
    SELECT a.*, u.nome AS professor,
      (SELECT COUNT(*) FROM frequencias f WHERE f.aula_id = a.id AND f.presente = 0) AS ausentes
    FROM aulas a LEFT JOIN usuarios u ON u.id = a.professor_id
    WHERE a.turma_id = ? AND a.disciplina_id = ? ORDER BY a.data DESC`, ok.turmaId, ok.discId));
}));

r.get('/chamada', wrap(async (req, res) => {
  const ok = await checar(req, res, req.query); if (!ok) return;
  const data = req.query.data;
  const [aula, entradas, mats, cfg] = await Promise.all([
    db.get('SELECT * FROM aulas WHERE turma_id = ? AND disciplina_id = ? AND data = ?', ok.turmaId, ok.discId, data),
    // indica quem passou pela catraca no dia (ajuda o professor na chamada)
    db.all(`SELECT DISTINCT aluno_id FROM acessos
      WHERE tipo = 'entrada' AND aluno_id IS NOT NULL AND substr(data_hora,1,10) = ?`, data),
    matriculasDaTurma(ok.turmaId),
    getConfig(),
  ]);
  const pres = aula ? await db.all('SELECT matricula_id, presente FROM frequencias WHERE aula_id = ?', aula.id) : [];
  const catraca = new Set(entradas.map((x) => x.aluno_id));
  const alunos = mats.map((m) => {
    const p = pres.find((x) => x.matricula_id === m.id);
    return { ...m, presente: p ? !!p.presente : m.situacao === 'cursando', catraca: catraca.has(m.aluno_id) };
  });
  res.json({ aula: aula || null, alunos, bimestre_atual: Number(cfg.bimestre_atual) || 1 });
}));

r.put('/chamada', wrap(async (req, res) => {
  const ok = await checar(req, res, req.body); if (!ok) return;
  const { data, bimestre, quantidade, conteudo, presencas } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return res.status(400).json({ erro: 'Data inválida' });
  const validas = new Set((await matriculasDaTurma(ok.turmaId)).map((m) => m.id));
  const id = await transaction(async () => {
    const { rows } = await db.run(`INSERT INTO aulas (turma_id, disciplina_id, professor_id, data, bimestre, quantidade, conteudo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (turma_id, disciplina_id, data) DO UPDATE SET bimestre = excluded.bimestre,
        quantidade = excluded.quantidade, conteudo = excluded.conteudo, professor_id = excluded.professor_id
      RETURNING id`,
    ok.turmaId, ok.discId, req.user.id, data, Number(bimestre) || 1, Math.max(1, Number(quantidade) || 1), conteudo || null);
    const aulaId = rows[0].id;
    for (const p of presencas || []) {
      if (!validas.has(Number(p.matricula_id))) continue;
      await db.run(`INSERT INTO frequencias (aula_id, matricula_id, presente) VALUES (?, ?, ?)
        ON CONFLICT (aula_id, matricula_id) DO UPDATE SET presente = excluded.presente`, aulaId, p.matricula_id, p.presente ? 1 : 0);
    }
    return aulaId;
  });
  res.json({ id });
}));

r.delete('/aulas/:id', wrap(async (req, res) => {
  const a = await db.get('SELECT * FROM aulas WHERE id = ?', req.params.id);
  if (!a) return res.status(404).json({ erro: 'Aula não encontrada' });
  if (!(await podeAcessar(req.user, a.turma_id, a.disciplina_id))) return res.status(403).json({ erro: 'Sem acesso' });
  await db.run('DELETE FROM aulas WHERE id = ?', a.id);
  res.json({ ok: true });
}));

export default r;
