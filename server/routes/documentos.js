import { Router } from 'express';
import { db, getConfig } from '../db.js';
import { podeAcessar } from '../auth.js';
import { boletim, matriculasDaTurma } from '../calc.js';
import { wrap } from './cadastros.js';

const r = Router();

r.get('/boletim/:matriculaId', wrap(async (req, res) => {
  const cfg = await getConfig();
  const b = await boletim(Number(req.params.matriculaId), cfg);
  if (!b) return res.status(404).json({ erro: 'Matrícula não encontrada' });
  if (!(await podeAcessar(req.user, b.matricula.turma_id))) return res.status(403).json({ erro: 'Sem acesso' });
  res.json({ escola: cfg, boletins: [b] });
}));

r.get('/boletins/turma/:turmaId', wrap(async (req, res) => {
  if (!(await podeAcessar(req.user, req.params.turmaId))) return res.status(403).json({ erro: 'Sem acesso' });
  const cfg = await getConfig();
  const mats = (await matriculasDaTurma(req.params.turmaId)).filter((m) => m.situacao === 'cursando' || req.query.todos);
  const boletins = await Promise.all(mats.map((m) => boletim(m.id, cfg)));
  res.json({ escola: cfg, boletins });
}));

r.get('/ata/:turmaId', wrap(async (req, res) => {
  if (!(await podeAcessar(req.user, req.params.turmaId))) return res.status(403).json({ erro: 'Sem acesso' });
  const cfg = await getConfig();
  const turma = await db.get('SELECT * FROM turmas WHERE id = ?', req.params.turmaId);
  if (!turma) return res.status(404).json({ erro: 'Turma não encontrada' });
  const [disciplinas, mats] = await Promise.all([
    db.all(`SELECT d.id, d.nome, d.carga_horaria FROM turma_disciplinas td JOIN disciplinas d ON d.id = td.disciplina_id
      WHERE td.turma_id = ? ORDER BY d.ordem, d.nome`, turma.id),
    matriculasDaTurma(turma.id),
  ]);
  const alunos = await Promise.all(mats.map(async (m) => {
    const b = await boletim(m.id, cfg);
    return {
      numero: m.numero, nome: m.nome, matricula: m.matricula, situacao: b.situacao, frequencia: b.frequencia,
      notas: Object.fromEntries(b.disciplinas.map((d) => [d.disciplina_id, d.mediaFinal ?? d.mediaParcial])),
    };
  }));
  const resumo = {};
  for (const a of alunos) resumo[a.situacao] = (resumo[a.situacao] || 0) + 1;
  res.json({ escola: cfg, turma, disciplinas, alunos, resumo });
}));

r.get('/historico/:alunoId', wrap(async (req, res) => {
  if (req.user.papel !== 'gestor') return res.status(403).json({ erro: 'Acesso restrito ao gestor' });
  const cfg = await getConfig();
  const aluno = await db.get('SELECT * FROM alunos WHERE id = ?', req.params.alunoId);
  if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado' });

  const [externos, mats] = await Promise.all([
    db.all('SELECT * FROM historico_externo WHERE aluno_id = ? ORDER BY ano_letivo', aluno.id),
    db.all(`SELECT m.id FROM matriculas m JOIN turmas t ON t.id = m.turma_id
      WHERE m.aluno_id = ? AND m.situacao NOT IN ('remanejado') ORDER BY t.ano_letivo`, aluno.id),
  ]);
  const anos = new Map();
  for (const h of externos) {
    const k = `${h.ano_letivo}|${h.serie}`;
    if (!anos.has(k)) anos.set(k, { ano_letivo: h.ano_letivo, serie: h.serie, escola: h.escola, cidade_uf: h.cidade_uf, resultado: h.resultado, disciplinas: [] });
    const a = anos.get(k);
    a.resultado ||= h.resultado;
    a.disciplinas.push({ nome: h.disciplina, nota: h.nota, carga_horaria: h.carga_horaria });
  }
  for (const b of await Promise.all(mats.map((m) => boletim(m.id, cfg)))) {
    anos.set(`${b.matricula.ano_letivo}|${b.matricula.serie}`, {
      ano_letivo: b.matricula.ano_letivo, serie: b.matricula.serie,
      escola: cfg.escola_nome, cidade_uf: [cfg.escola_cidade, cfg.escola_uf].filter(Boolean).join('/'),
      resultado: b.situacao, frequencia: b.frequencia,
      disciplinas: b.disciplinas.map((d) => ({ nome: d.disciplina, nota: d.mediaFinal ?? d.mediaParcial, carga_horaria: d.carga_horaria })),
    });
  }
  res.json({ escola: cfg, aluno, anos: [...anos.values()].sort((a, b) => a.ano_letivo - b.ano_letivo) });
}));

/** Dados para declarações (matrícula, frequência, transferência, conclusão). */
r.get('/declaracao/:alunoId', wrap(async (req, res) => {
  if (req.user.papel !== 'gestor') return res.status(403).json({ erro: 'Acesso restrito ao gestor' });
  const cfg = await getConfig();
  const aluno = await db.get('SELECT * FROM alunos WHERE id = ?', req.params.alunoId);
  if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado' });
  const m = await db.get(`SELECT m.id FROM matriculas m JOIN turmas t ON t.id = m.turma_id
    WHERE m.aluno_id = ? ORDER BY t.ano_letivo DESC, m.id DESC LIMIT 1`, aluno.id);
  res.json({ escola: cfg, aluno, boletim: m ? await boletim(m.id, cfg) : null });
}));

export default r;
