import { db, getConfig } from './db.js';

const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

export const SITUACOES_ENCERRADAS = ['transferido', 'desistente', 'remanejado'];

/** Notas por bimestre, médias, faltas e situação de uma matrícula. */
export function boletim(matriculaId, cfg = getConfig()) {
  const mat = db.prepare(`
    SELECT m.*, t.nome AS turma_nome, t.serie, t.nivel, t.turno, t.ano_letivo
    FROM matriculas m JOIN turmas t ON t.id = m.turma_id WHERE m.id = ?`).get(matriculaId);
  if (!mat) return null;
  const aluno = db.prepare('SELECT * FROM alunos WHERE id = ?').get(mat.aluno_id);
  const media = Number(cfg.media_aprovacao) || 6;
  const freqMin = Number(cfg.frequencia_minima) || 75;

  const disciplinas = db.prepare(`
    SELECT d.id, d.nome, d.carga_horaria, u.nome AS professor
    FROM turma_disciplinas td JOIN disciplinas d ON d.id = td.disciplina_id
    LEFT JOIN usuarios u ON u.id = td.professor_id
    WHERE td.turma_id = ? ORDER BY d.ordem, d.nome`).all(mat.turma_id);

  const notas = db.prepare('SELECT * FROM notas WHERE matricula_id = ?').all(matriculaId);
  const aulas = db.prepare(`
    SELECT disciplina_id, bimestre, SUM(quantidade) AS total FROM aulas
    WHERE turma_id = ? GROUP BY disciplina_id, bimestre`).all(mat.turma_id);
  const faltas = db.prepare(`
    SELECT a.disciplina_id, a.bimestre, SUM(a.quantidade) AS total
    FROM frequencias f JOIN aulas a ON a.id = f.aula_id
    WHERE f.matricula_id = ? AND f.presente = 0 GROUP BY a.disciplina_id, a.bimestre`).all(matriculaId);

  const pick = (rows, d, b) => rows.find((x) => x.disciplina_id === d && x.bimestre === b);
  let totAulas = 0, totFaltas = 0;

  const linhas = disciplinas.map((d) => {
    const bim = [1, 2, 3, 4].map((b) => {
      const n = pick(notas, d.id, b);
      const nota = n?.nota ?? null, rec = n?.recuperacao ?? null;
      const final = nota == null && rec == null ? null : Math.max(nota ?? 0, rec ?? 0);
      return {
        nota, recuperacao: rec, media: r1(final),
        aulas: pick(aulas, d.id, b)?.total ?? 0,
        faltas: pick(faltas, d.id, b)?.total ?? 0,
      };
    });
    const lancadas = bim.filter((b) => b.media != null);
    const mediaAnual = lancadas.length === 4 ? r1(lancadas.reduce((s, b) => s + b.media, 0) / 4) : null;
    const mediaParcial = lancadas.length ? r1(lancadas.reduce((s, b) => s + b.media, 0) / lancadas.length) : null;
    const recFinal = pick(notas, d.id, 5)?.nota ?? null;
    let mediaFinal = mediaAnual;
    if (mediaAnual != null && mediaAnual < media && recFinal != null) mediaFinal = r1(Math.max(mediaAnual, recFinal));

    let situacao = 'Cursando';
    if (mediaFinal != null) {
      if (mediaFinal >= media) situacao = 'Aprovado';
      else situacao = recFinal == null ? 'Recuperação' : 'Reprovado';
    }
    const a = bim.reduce((s, b) => s + b.aulas, 0);
    const f = bim.reduce((s, b) => s + b.faltas, 0);
    totAulas += a; totFaltas += f;
    return {
      disciplina_id: d.id, disciplina: d.nome, carga_horaria: d.carga_horaria, professor: d.professor,
      bimestres: bim, mediaParcial, mediaAnual, recFinal, mediaFinal,
      aulas: a, faltas: f, frequencia: a ? r1(((a - f) / a) * 100) : null, situacao,
    };
  });

  const frequencia = totAulas ? r1(((totAulas - totFaltas) / totAulas) * 100) : null;
  let situacao;
  if (SITUACOES_ENCERRADAS.includes(mat.situacao)) situacao = mat.situacao[0].toUpperCase() + mat.situacao.slice(1);
  else if (!linhas.length || linhas.some((l) => l.situacao === 'Cursando')) situacao = 'Cursando';
  else if (frequencia != null && frequencia < freqMin) situacao = 'Reprovado por falta';
  else if (linhas.some((l) => l.situacao === 'Reprovado')) situacao = 'Reprovado';
  else if (linhas.some((l) => l.situacao === 'Recuperação')) situacao = 'Recuperação';
  else situacao = 'Aprovado';

  return {
    matricula: mat, aluno, disciplinas: linhas,
    totalAulas: totAulas, totalFaltas: totFaltas, frequencia, situacao,
    regras: { media, frequenciaMinima: freqMin },
  };
}

export function matriculasDaTurma(turmaId) {
  return db.prepare(`
    SELECT m.id, m.numero, m.situacao, m.aluno_id, a.nome, a.matricula
    FROM matriculas m JOIN alunos a ON a.id = m.aluno_id
    WHERE m.turma_id = ? ORDER BY COALESCE(m.numero, 9999), a.nome`).all(turmaId);
}
