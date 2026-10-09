import { Router } from 'express';
import { db, getConfig, transaction } from '../db.js';
import { podeAcessar } from '../auth.js';
import { matriculasDaTurma, boletim } from '../calc.js';
import { wrap } from './cadastros.js';

const r = Router();

function checar(req, res, src) {
  const turmaId = Number(src.turma_id), discId = Number(src.disciplina_id);
  if (!turmaId || !discId) { res.status(400).json({ erro: 'Informe turma e disciplina' }); return null; }
  if (!podeAcessar(req.user, turmaId, discId)) { res.status(403).json({ erro: 'Você não leciona esta disciplina nesta turma' }); return null; }
  return { turmaId, discId };
}

const nota = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  if (Number.isNaN(n) || n < 0 || n > 10) throw Object.assign(new Error(`Nota inválida: ${v} (use 0 a 10)`), { status: 400 });
  return n;
};

/* ---------------- Notas ---------------- */
r.get('/notas', wrap((req, res) => {
  const ok = checar(req, res, req.query); if (!ok) return;
  const notas = db.prepare(`SELECT n.* FROM notas n JOIN matriculas m ON m.id = n.matricula_id
    WHERE m.turma_id = ? AND n.disciplina_id = ?`).all(ok.turmaId, ok.discId);
  const cfg = getConfig();
  const alunos = matriculasDaTurma(ok.turmaId).map((m) => {
    const b = boletim(m.id, cfg).disciplinas.find((d) => d.disciplina_id === ok.discId);
    const porBim = {};
    for (const n of notas.filter((n) => n.matricula_id === m.id)) porBim[n.bimestre] = { nota: n.nota, recuperacao: n.recuperacao };
    return { ...m, notas: porBim, mediaParcial: b?.mediaParcial, mediaFinal: b?.mediaFinal, faltas: b?.faltas, situacaoDisc: b?.situacao };
  });
  res.json({ alunos, media: Number(cfg.media_aprovacao) });
}));

r.put('/notas', (req, res) => {
  try {
    const ok = checar(req, res, req.body); if (!ok) return;
    const bim = Number(req.body.bimestre);
    if (!(bim >= 1 && bim <= 5)) return res.status(400).json({ erro: 'Bimestre inválido' });
    const validas = new Set(matriculasDaTurma(ok.turmaId).map((m) => m.id));
    const up = db.prepare(`INSERT INTO notas (matricula_id, disciplina_id, bimestre, nota, recuperacao, atualizado_em)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(matricula_id, disciplina_id, bimestre) DO UPDATE SET nota = excluded.nota, recuperacao = excluded.recuperacao, atualizado_em = CURRENT_TIMESTAMP`);
    transaction(() => {
      for (const l of req.body.lancamentos || []) {
        if (!validas.has(Number(l.matricula_id))) continue;
        up.run(l.matricula_id, ok.discId, bim, nota(l.nota), bim === 5 ? null : nota(l.recuperacao));
      }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message });
  }
});

/* ---------------- Frequência ---------------- */
r.get('/aulas', wrap((req, res) => {
  const ok = checar(req, res, req.query); if (!ok) return;
  res.json(db.prepare(`
    SELECT a.*, u.nome AS professor,
      (SELECT COUNT(*) FROM frequencias f WHERE f.aula_id = a.id AND f.presente = 0) AS ausentes
    FROM aulas a LEFT JOIN usuarios u ON u.id = a.professor_id
    WHERE a.turma_id = ? AND a.disciplina_id = ? ORDER BY a.data DESC`).all(ok.turmaId, ok.discId));
}));

r.get('/chamada', wrap((req, res) => {
  const ok = checar(req, res, req.query); if (!ok) return;
  const data = req.query.data;
  const aula = db.prepare('SELECT * FROM aulas WHERE turma_id = ? AND disciplina_id = ? AND data = ?').get(ok.turmaId, ok.discId, data);
  const pres = aula ? db.prepare('SELECT matricula_id, presente FROM frequencias WHERE aula_id = ?').all(aula.id) : [];
  // indica quem passou pela catraca no dia (ajuda o professor na chamada)
  const catraca = new Set(db.prepare(`SELECT DISTINCT aluno_id FROM acessos
    WHERE tipo = 'entrada' AND aluno_id IS NOT NULL AND substr(data_hora,1,10) = ?`).all(data).map((x) => x.aluno_id));
  const alunos = matriculasDaTurma(ok.turmaId).map((m) => {
    const p = pres.find((x) => x.matricula_id === m.id);
    return { ...m, presente: p ? !!p.presente : m.situacao === 'cursando', catraca: catraca.has(m.aluno_id) };
  });
  res.json({ aula: aula || null, alunos, bimestre_atual: Number(getConfig().bimestre_atual) || 1 });
}));

r.put('/chamada', wrap((req, res) => {
  const ok = checar(req, res, req.body); if (!ok) return;
  const { data, bimestre, quantidade, conteudo, presencas } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return res.status(400).json({ erro: 'Data inválida' });
  const validas = new Set(matriculasDaTurma(ok.turmaId).map((m) => m.id));
  const id = transaction(() => {
    db.prepare(`INSERT INTO aulas (turma_id, disciplina_id, professor_id, data, bimestre, quantidade, conteudo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(turma_id, disciplina_id, data) DO UPDATE SET bimestre = excluded.bimestre,
        quantidade = excluded.quantidade, conteudo = excluded.conteudo, professor_id = excluded.professor_id`)
      .run(ok.turmaId, ok.discId, req.user.id, data, Number(bimestre) || 1, Math.max(1, Number(quantidade) || 1), conteudo || null);
    const aulaId = db.prepare('SELECT id FROM aulas WHERE turma_id = ? AND disciplina_id = ? AND data = ?').get(ok.turmaId, ok.discId, data).id;
    const up = db.prepare(`INSERT INTO frequencias (aula_id, matricula_id, presente) VALUES (?, ?, ?)
      ON CONFLICT(aula_id, matricula_id) DO UPDATE SET presente = excluded.presente`);
    for (const p of presencas || []) if (validas.has(Number(p.matricula_id))) up.run(aulaId, p.matricula_id, p.presente ? 1 : 0);
    return aulaId;
  });
  res.json({ id });
}));

r.delete('/aulas/:id', wrap((req, res) => {
  const a = db.prepare('SELECT * FROM aulas WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ erro: 'Aula não encontrada' });
  if (!podeAcessar(req.user, a.turma_id, a.disciplina_id)) return res.status(403).json({ erro: 'Sem acesso' });
  db.prepare('DELETE FROM aulas WHERE id = ?').run(a.id);
  res.json({ ok: true });
}));

export default r;
