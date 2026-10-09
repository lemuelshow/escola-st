// Popula o banco com dados fictícios para demonstração.
// Uso: npm run seed            (só roda em banco sem alunos)
//      npm run seed -- --reset (APAGA alunos, turmas, professores, aulas etc. e recria)
import { db, query, iniciarBanco, fecharBanco, transaction } from '../server/db.js';
import { hashSenha } from '../server/auth.js';

const SENHA_PROFESSOR = 'prof123';
const reset = process.argv.includes('--reset');

// gerador determinístico: os mesmos dados a cada execução
let semente = 20261009;
const rand = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
const entre = (a, b) => a + Math.floor(rand() * (b - a + 1));
const nota1 = (base) => Math.max(0, Math.min(10, Math.round((base + (rand() - 0.5) * 3) * 2) / 2));
const dataISO = (d) => d.toLocaleDateString('sv-SE');

function cpf() {
  const n = Array.from({ length: 9 }, () => entre(0, 9));
  for (const len of [9, 10]) {
    const s = n.slice(0, len).reduce((acc, v, i) => acc + v * (len + 1 - i), 0);
    n.push(((s * 10) % 11) % 10);
  }
  const t = n.join('');
  return `${t.slice(0, 3)}.${t.slice(3, 6)}.${t.slice(6, 9)}-${t.slice(9)}`;
}
const telefone = () => `(85) 9${entre(8100, 9999)}-${String(entre(0, 9999)).padStart(4, '0')}`;

/** INSERT de várias linhas de uma vez (poucas idas ao banco). */
async function inserirVarios(tabela, colunas, linhas, retornar = false) {
  const ids = [];
  const porLote = Math.floor(60000 / colunas.length);
  for (let i = 0; i < linhas.length; i += porLote) {
    const lote = linhas.slice(i, i + porLote);
    const valores = lote.map((l) => `(${l.map(() => '?').join(',')})`).join(',');
    const { rows } = await db.run(`INSERT INTO ${tabela} (${colunas.join(',')}) VALUES ${valores}${retornar ? ' RETURNING id' : ''}`, ...lote.flat());
    ids.push(...rows.map((r) => r.id));
  }
  return ids;
}

const PROFESSORES = [
  ['Juliana Martins Rocha', 'juliana.rocha@escola.com', 'Língua Portuguesa'],
  ['Ricardo Alves Pereira', 'ricardo.pereira@escola.com', 'Matemática'],
  ['Fernanda Costa Lima', 'fernanda.lima@escola.com', 'Ciências'],
  ['Paulo Henrique Sousa', 'paulo.sousa@escola.com', 'História'],
  ['Aline Barbosa Nunes', 'aline.nunes@escola.com', 'Geografia'],
  ['Tatiane Moura Freitas', 'tatiane.freitas@escola.com', 'Arte'],
  ['Diego Carvalho Melo', 'diego.melo@escola.com', 'Educação Física'],
  ['Patrícia Gomes Ribeiro', 'patricia.ribeiro@escola.com', 'Língua Inglesa'],
  ['Marcos Vinícius Teixeira', 'marcos.teixeira@escola.com', 'Matemática'],
  ['Camila Duarte Farias', 'camila.farias@escola.com', 'Língua Portuguesa'],
];

const TURMAS = [
  { nome: '6º Ano A', serie: '6º Ano', turno: 'Matutino', nascimento: 2014, extras: { 'Língua Portuguesa': 0, 'Matemática': 1 } },
  { nome: '7º Ano A', serie: '7º Ano', turno: 'Vespertino', nascimento: 2013, extras: { 'Língua Portuguesa': 9, 'Matemática': 8 } },
];

// [nome, sexo, turma (índice), desempenho base, chance de faltar]
const ALUNOS = [
  ['Ana Clara Mendes Barbosa', 'F', 0, 8.6, 0.03],
  ['Arthur Oliveira Alves', 'M', 0, 7.4, 0.05],
  ['Beatriz Cavalcante Vieira', 'F', 0, 9.1, 0.02],
  ['Davi Fernandes Gomes', 'M', 0, 4.6, 0.08],
  ['Helena Carvalho Rocha', 'F', 0, 7.9, 0.30],
  ['Gabriel Lopes Ferreira', 'M', 1, 6.8, 0.06],
  ['Isabela Ribeiro Alves', 'F', 1, 8.2, 0.04],
  ['Lucas Gomes Pereira', 'M', 1, 7.1, 0.05],
  ['Manuela Rodrigues Nascimento', 'F', 1, 9.3, 0.02],
  ['Samuel Dias Barbosa', 'M', 1, 5.0, 0.07],
];
const SOBRENOMES_PAIS = ['Cláudia', 'Rosângela', 'Daniela', 'Cristiane', 'Simone', 'Adriana', 'Kátia', 'Patrícia', 'Luciana', 'Márcia'];
const RUAS = ['Rua das Flores', 'Av. Santos Dumont', 'Rua Barão de Aracati', 'Rua Padre Valdevino', 'Av. Dom Luís'];
const CONTEUDOS = {
  'Língua Portuguesa': ['Leitura e interpretação', 'Classes gramaticais', 'Produção de texto', 'Ortografia'],
  'Matemática': ['Frações', 'Números decimais', 'Equações do 1º grau', 'Geometria plana'],
  'Ciências': ['Ecossistemas', 'Sistema solar', 'Células', 'Água e ar'],
  'História': ['Antiguidade', 'Brasil colonial', 'Grécia antiga', 'Idade Média'],
  'Geografia': ['Relevo', 'Clima', 'Cartografia', 'População'],
  'Arte': ['Cores primárias', 'Arte rupestre', 'Música popular', 'Teatro'],
  'Educação Física': ['Vôlei', 'Futsal', 'Alongamento', 'Atletismo'],
  'Língua Inglesa': ['Greetings', 'Numbers', 'Simple present', 'Vocabulary'],
};
// grade semanal: disciplinas por dia (seg..sex)
const GRADE = [
  ['Língua Portuguesa', 'Matemática', 'Ciências', 'História'],
  ['Matemática', 'Língua Portuguesa', 'Geografia', 'Arte'],
  ['Língua Portuguesa', 'Matemática', 'Língua Inglesa', 'Educação Física'],
  ['Matemática', 'Ciências', 'História', 'Geografia'],
  ['Língua Portuguesa', 'Matemática', 'Língua Inglesa', 'Arte'],
];

async function main() {
  await iniciarBanco();
  const { n } = await db.get('SELECT COUNT(*) n FROM alunos');
  if (n && !reset) {
    console.log(`O banco já tem ${n} aluno(s). Use "npm run seed -- --reset" para apagar e recriar os dados de demonstração.`);
    return;
  }

  await transaction(async () => {
    if (reset) {
      await query(`TRUNCATE acessos, dispositivos, frequencias, aulas, notas, matriculas, historico_externo, fotos,
        turma_disciplinas, alunos, turmas RESTART IDENTITY CASCADE`);
      await query("DELETE FROM usuarios WHERE papel = 'professor'");
    }
    const ano = new Date().getFullYear();
    await query("UPDATE config SET valor = ? WHERE chave = 'ano_letivo'", [String(ano)]);
    await query("UPDATE config SET valor = '4' WHERE chave = 'bimestre_atual'");
    await query("UPDATE config SET valor = 'Centro Educacional Futuro' WHERE chave = 'escola_nome'");
    await query("UPDATE config SET valor = 'Fortaleza' WHERE chave = 'escola_cidade'");
    await query("UPDATE config SET valor = 'CE' WHERE chave = 'escola_uf'");

    const disciplinas = Object.fromEntries((await db.all('SELECT id, nome FROM disciplinas')).map((d) => [d.nome, d.id]));

    // professores
    const hash = hashSenha(SENHA_PROFESSOR);
    const profIds = await inserirVarios('usuarios', ['nome', 'email', 'senha_hash', 'papel', 'telefone'],
      PROFESSORES.map(([nome, email]) => [nome, email, hash, 'professor', telefone()]), true);

    // turmas + grade com professor por disciplina
    const turmaIds = await inserirVarios('turmas', ['nome', 'serie', 'nivel', 'turno', 'ano_letivo'],
      TURMAS.map((t) => [t.nome, t.serie, 'Ensino Fundamental - Anos Finais', t.turno, ano]), true);
    const td = [];
    TURMAS.forEach((t, i) => {
      for (const [disc, id] of Object.entries(disciplinas)) {
        const p = disc in t.extras ? t.extras[disc] : PROFESSORES.findIndex((x) => x[2] === disc);
        td.push([turmaIds[i], id, profIds[p]]);
      }
    });
    await inserirVarios('turma_disciplinas', ['turma_id', 'disciplina_id', 'professor_id'], td);
    const professorDe = (turmaId, discId) => td.find((x) => x[0] === turmaId && x[1] === discId)[2];

    // alunos + matrículas
    const alunoIds = await inserirVarios('alunos',
      ['nome', 'matricula', 'data_nascimento', 'sexo', 'cpf', 'naturalidade', 'uf_naturalidade', 'nome_mae', 'nome_pai',
        'responsavel', 'telefone', 'email', 'endereco', 'catraca_sync'],
      ALUNOS.map(([nome, sexo, t], i) => {
        const sobrenome = nome.split(' ').slice(-1)[0];
        const mae = `${SOBRENOMES_PAIS[i]} ${nome.split(' ').slice(-2).join(' ')}`;
        const nasc = `${TURMAS[t].nascimento}-${String(entre(1, 12)).padStart(2, '0')}-${String(entre(1, 28)).padStart(2, '0')}`;
        return [nome, `${ano}${String(i + 1).padStart(4, '0')}`, nasc, sexo, cpf(), 'Fortaleza', 'CE', mae,
          `${['José', 'Antônio', 'Francisco', 'Carlos', 'Paulo'][i % 5]} ${sobrenome}`, mae, telefone(),
          `${nome.split(' ')[0].toLowerCase()}.${sobrenome.toLowerCase()}@email.com`
            .normalize('NFD').replace(/[̀-ͯ]/g, ''),
          `${RUAS[i % RUAS.length]}, ${entre(10, 1999)} - Fortaleza/CE`, i % 4 === 3 ? null : new Date().toLocaleString('sv-SE')];
      }), true);
    const matIds = [];
    for (const i of TURMAS.keys()) {
      const daTurma = ALUNOS.map((a, k) => [a, k]).filter(([a]) => a[2] === i).sort((x, y) => x[0][0].localeCompare(y[0][0], 'pt-BR'));
      matIds.push(...(await inserirVarios('matriculas', ['aluno_id', 'turma_id', 'numero', 'data_matricula'],
        daTurma.map(([, k], n) => [alunoIds[k], turmaIds[i], n + 1, `${ano}-02-02`]), true)).map((id, n) => ({ id, k: daTurma[n][1], turma: i })));
    }

    // notas dos bimestres 1 a 3 (o 4º está em andamento)
    const notas = [];
    for (const m of matIds) {
      const base = ALUNOS[m.k][3];
      for (const discId of Object.values(disciplinas)) {
        for (let b = 1; b <= 3; b++) {
          const n = nota1(base);
          notas.push([m.id, discId, b, n, n < 6 ? nota1(base + 0.8) : null]);
        }
      }
    }
    await inserirVarios('notas', ['matricula_id', 'disciplina_id', 'bimestre', 'nota', 'recuperacao'], notas);

    // aulas dos últimos 30 dias letivos, seguindo a grade, com chamada
    const dias = [];
    for (const d = new Date(); dias.length < 30; d.setDate(d.getDate() - 1)) if (d.getDay() % 6) dias.unshift(new Date(d));
    const aulas = [];
    for (const i of TURMAS.keys()) {
      for (const d of dias) {
        for (const disc of GRADE[d.getDay() - 1]) {
          const discId = disciplinas[disc];
          const lista = CONTEUDOS[disc];
          aulas.push([turmaIds[i], discId, professorDe(turmaIds[i], discId), dataISO(d), 4, 1, lista[entre(0, lista.length - 1)]]);
        }
      }
    }
    const aulaIds = await inserirVarios('aulas', ['turma_id', 'disciplina_id', 'professor_id', 'data', 'bimestre', 'quantidade', 'conteudo'], aulas, true);
    // um aluno que falta num dia falta em todas as aulas daquele dia
    const faltou = new Map();
    const freq = [];
    aulas.forEach((a, j) => {
      const turma = turmaIds.indexOf(a[0]);
      for (const m of matIds.filter((x) => x.turma === turma)) {
        const chave = `${m.id}|${a[3]}`;
        if (!faltou.has(chave)) faltou.set(chave, rand() < ALUNOS[m.k][4]);
        freq.push([aulaIds[j], m.id, faltou.get(chave) ? 0 : 1]);
      }
    });
    await inserirVarios('frequencias', ['aula_id', 'matricula_id', 'presente'], freq);

    // catraca: equipamento (inativo, sem IP real) e passagens dos últimos 10 dias úteis
    const [dispId] = await inserirVarios('dispositivos', ['nome', 'ip', 'porta', 'sentido', 'ativo'], [['Portaria principal', '192.168.0.50', 80, 'portal', 0]], true);
    const acessos = [];
    let logId = 1;
    const hoje = dataISO(new Date());
    for (const d of dias.slice(-10)) {
      const dia = dataISO(d);
      for (const m of matIds) {
        if (faltou.get(`${m.id}|${dia}`)) continue;
        const manha = TURMAS[m.turma].turno === 'Matutino';
        const hEnt = manha ? `06:${entre(40, 59)}` : `12:${entre(40, 59)}`;
        acessos.push([dispId, logId++, alunoIds[m.k], `${dia} ${hEnt}:${String(entre(0, 59)).padStart(2, '0')}`, 'entrada', 7, 'Acesso liberado']);
        const agoraHora = new Date().toTimeString().slice(0, 5);
        const hSai = manha ? `11:${entre(30, 50)}` : `17:${entre(30, 50)}`;
        if (dia !== hoje || agoraHora > hSai) {
          acessos.push([dispId, logId++, alunoIds[m.k], `${dia} ${hSai}:${String(entre(0, 59)).padStart(2, '0')}`, 'saida', 7, 'Acesso liberado']);
        }
      }
      if (rand() < 0.5) acessos.push([dispId, logId++, null, `${dia} 07:${entre(10, 30)}:00`, 'nao_identificado', 3, 'Não identificado']);
    }
    await inserirVarios('acessos', ['dispositivo_id', 'log_id', 'aluno_id', 'data_hora', 'tipo', 'evento', 'descricao'], acessos);
    await query('UPDATE dispositivos SET ultimo_log_id = ? WHERE id = ?', [logId - 1, dispId]);

    console.log(`Criados: ${PROFESSORES.length} professores, ${TURMAS.length} turmas, ${ALUNOS.length} alunos, ` +
      `${notas.length} notas, ${aulas.length} aulas, ${freq.length} registros de chamada, ${acessos.length} passagens na catraca.`);
  });

  console.log('\nLogins:');
  console.log('  Gestor:    admin@escola.com / admin123');
  for (const [nome, email] of PROFESSORES) console.log(`  Professor: ${email} / ${SENHA_PROFESSOR}  (${nome})`);
}

try {
  await main();
} catch (e) {
  console.error('Erro ao popular o banco:', e);
  process.exitCode = 1;
} finally {
  await fecharBanco();
}
