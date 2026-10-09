import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { qs } from '../api.js';
import { Campo, useApi } from '../components/ui.jsx';

export const TIPOS_DECLARACAO = {
  matricula: 'Declaração de matrícula',
  frequencia: 'Declaração de frequência',
  transferencia: 'Declaração de transferência',
  conclusao: 'Declaração de conclusão',
};

export default function Documentos() {
  const [sp] = useSearchParams();
  const [turma, setTurma] = useState('');
  const [q, setQ] = useState('');
  const [aluno, setAluno] = useState(sp.get('aluno') || '');
  const turmas = useApi('/turmas').data;
  const alunos = useApi(`/alunos${qs({ q, turma_id: turma, ativo: 'todos' })}`).data;
  const turmaSel = turmas?.find((t) => String(t.id) === turma);
  const alunoSel = alunos?.find((a) => String(a.id) === aluno);
  const abrir = (url) => window.open(url, '_blank');

  return (
    <>
      <div className="topo"><div><h1>Documentos</h1><p>Os documentos abrem em uma nova aba prontos para impressão (A4). Textos de declarações podem ser editados antes de imprimir.</p></div></div>

      <div className="cartao">
        <h2>Por turma</h2>
        <div className="filtros">
          <Campo label="Turma">
            <select value={turma} onChange={(e) => { setTurma(e.target.value); setAluno(''); }}>
              <option value="">Selecione…</option>
              {turmas?.map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.ano_letivo})</option>)}
            </select>
          </Campo>
          <div className="acoes" style={{ paddingBottom: 1 }}>
            <button className="btn" disabled={!turma} onClick={() => abrir(`/imprimir/boletim/turma/${turma}`)}>Boletins da turma</button>
            <button className="btn" disabled={!turma} onClick={() => abrir(`/imprimir/ata/${turma}`)}>Ata de resultados finais</button>
          </div>
        </div>
        {turmaSel && <small>{turmaSel.alunos} aluno(s) cursando.</small>}
      </div>

      <div className="cartao">
        <h2>Por aluno</h2>
        <div className="filtros">
          <Campo label="Buscar aluno"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou matrícula" /></Campo>
          <Campo label="Aluno">
            <select value={aluno} onChange={(e) => setAluno(e.target.value)} style={{ minWidth: 280 }}>
              <option value="">Selecione…</option>
              {alunos?.map((a) => <option key={a.id} value={a.id}>{a.nome} — {a.matricula}</option>)}
            </select>
          </Campo>
        </div>
        {alunoSel && <p style={{ marginTop: 0 }}><small>Turma atual: {alunoSel.turma || '—'}</small></p>}
        <div className="acoes">
          <button className="btn" disabled={!aluno} onClick={() => abrir(`/imprimir/historico/${aluno}`)}>Histórico escolar</button>
          {Object.entries(TIPOS_DECLARACAO).map(([k, l]) => (
            <button key={k} className="btn sec" disabled={!aluno} onClick={() => abrir(`/imprimir/declaracao/${k}/${aluno}`)}>{l}</button>
          ))}
        </div>
      </div>
    </>
  );
}
