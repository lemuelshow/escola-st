import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const FOTOS_DIR = path.join(DATA_DIR, 'fotos');
fs.mkdirSync(FOTOS_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'escola.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('gestor','professor')),
  telefone TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS disciplinas (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  carga_horaria INTEGER NOT NULL DEFAULT 80,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS turmas (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  serie TEXT NOT NULL,
  nivel TEXT,
  turno TEXT,
  ano_letivo INTEGER NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS turma_disciplinas (
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id),
  professor_id INTEGER REFERENCES usuarios(id),
  PRIMARY KEY (turma_id, disciplina_id)
);

CREATE TABLE IF NOT EXISTS alunos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  matricula TEXT NOT NULL UNIQUE,
  data_nascimento TEXT,
  sexo TEXT,
  cpf TEXT,
  rg TEXT,
  naturalidade TEXT,
  uf_naturalidade TEXT,
  nacionalidade TEXT DEFAULT 'Brasileira',
  nome_mae TEXT,
  nome_pai TEXT,
  responsavel TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  observacoes TEXT,
  foto INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  bloqueado INTEGER NOT NULL DEFAULT 0,
  catraca_sync TEXT,
  catraca_erro TEXT,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matriculas (
  id INTEGER PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  numero INTEGER,
  data_matricula TEXT DEFAULT (date('now','localtime')),
  situacao TEXT NOT NULL DEFAULT 'cursando',
  UNIQUE (aluno_id, turma_id)
);

-- bimestre 1..4; bimestre 5 = recuperacao final
CREATE TABLE IF NOT EXISTS notas (
  matricula_id INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
  disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id),
  bimestre INTEGER NOT NULL CHECK (bimestre BETWEEN 1 AND 5),
  nota REAL,
  recuperacao REAL,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (matricula_id, disciplina_id, bimestre)
);

CREATE TABLE IF NOT EXISTS aulas (
  id INTEGER PRIMARY KEY,
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  disciplina_id INTEGER NOT NULL REFERENCES disciplinas(id),
  professor_id INTEGER REFERENCES usuarios(id),
  data TEXT NOT NULL,
  bimestre INTEGER NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  conteudo TEXT,
  UNIQUE (turma_id, disciplina_id, data)
);

CREATE TABLE IF NOT EXISTS frequencias (
  aula_id INTEGER NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
  matricula_id INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
  presente INTEGER NOT NULL,
  PRIMARY KEY (aula_id, matricula_id)
);

CREATE TABLE IF NOT EXISTS historico_externo (
  id INTEGER PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  ano_letivo INTEGER NOT NULL,
  serie TEXT NOT NULL,
  escola TEXT,
  cidade_uf TEXT,
  disciplina TEXT NOT NULL,
  nota TEXT,
  carga_horaria INTEGER,
  resultado TEXT
);

CREATE TABLE IF NOT EXISTS dispositivos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  ip TEXT NOT NULL,
  porta INTEGER NOT NULL DEFAULT 80,
  usuario TEXT NOT NULL DEFAULT 'admin',
  senha TEXT NOT NULL DEFAULT 'admin',
  sentido TEXT NOT NULL DEFAULT 'portal',
  ativo INTEGER NOT NULL DEFAULT 1,
  ultimo_log_id INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  ultima_comunicacao TEXT
);

CREATE TABLE IF NOT EXISTS acessos (
  id INTEGER PRIMARY KEY,
  dispositivo_id INTEGER REFERENCES dispositivos(id) ON DELETE SET NULL,
  log_id INTEGER,
  aluno_id INTEGER REFERENCES alunos(id) ON DELETE SET NULL,
  data_hora TEXT NOT NULL,
  tipo TEXT NOT NULL,
  evento INTEGER,
  descricao TEXT,
  UNIQUE (dispositivo_id, log_id)
);
CREATE INDEX IF NOT EXISTS ix_acessos_data ON acessos (data_hora);
CREATE INDEX IF NOT EXISTS ix_acessos_aluno ON acessos (aluno_id, data_hora);
`);

const CONFIG_PADRAO = {
  escola_nome: 'Escola Modelo',
  escola_cnpj: '',
  escola_inep: '',
  escola_endereco: '',
  escola_cidade: '',
  escola_uf: '',
  escola_telefone: '',
  escola_ato: '',
  diretor_nome: '',
  secretario_nome: '',
  ano_letivo: String(new Date().getFullYear()),
  bimestre_atual: '1',
  media_aprovacao: '6',
  frequencia_minima: '75',
  catraca_coleta_auto: '1',
  catraca_intervalo: '30',
  catraca_portal_entrada: '1',
  catraca_hora: 'local',
};

const insCfg = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
for (const [k, v] of Object.entries(CONFIG_PADRAO)) insCfg.run(k, v);

if (!db.prepare("SELECT 1 FROM usuarios WHERE papel = 'gestor'").get()) {
  db.prepare("INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, 'gestor')")
    .run('Administrador', 'admin@escola.com', bcrypt.hashSync('admin123', 10));
  console.log('Usuario gestor criado: admin@escola.com / admin123 (troque a senha!)');
}

if (!db.prepare('SELECT 1 FROM disciplinas').get()) {
  const ins = db.prepare('INSERT INTO disciplinas (nome, carga_horaria, ordem) VALUES (?, ?, ?)');
  ['Língua Portuguesa', 'Matemática', 'Ciências', 'História', 'Geografia', 'Arte', 'Educação Física', 'Língua Inglesa']
    .forEach((n, i) => ins.run(n, i < 2 ? 200 : 80, i + 1));
}

export function getConfig() {
  const cfg = {};
  for (const r of db.prepare('SELECT chave, valor FROM config').all()) cfg[r.chave] = r.valor;
  return cfg;
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
