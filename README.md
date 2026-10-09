# Gestão Escolar

Sistema web para escola: cadastro de alunos, turmas, professores e disciplinas; diário de classe
(chamada e notas bimestrais); boletim, ata de resultados finais, histórico escolar e declarações
para impressão; integração com catraca facial Control iD.

## Como rodar

Requisito: **Node.js 22.5 ou superior** (o banco é SQLite nativo do Node, sem instalar nada a mais).

```bash
npm install
npm run build     # gera a interface (pasta dist/)
npm start         # http://localhost:3001
```

No Windows basta dar dois cliques em `iniciar.bat`.

Primeiro acesso: **admin@escola.com / admin123** — troque a senha em *Configurações*.

Desenvolvimento com recarga automática: `npm run dev` (interface em http://localhost:5173).

Os dados ficam em `data/` (`escola.db` + fotos). **Faça backup dessa pasta.**

## Perfis

| Gestor | Professor |
|---|---|
| Cadastra alunos, turmas, disciplinas e professores | Vê só as turmas/disciplinas atribuídas a ele |
| Atribui turmas/disciplinas ao professor (tela *Professores › Turmas* ou na grade da turma) | Lança chamada (com conteúdo da aula) e notas |
| Emite boletins, ata, histórico, declarações | |
| Gerencia a catraca | |

## Regras de avaliação (configuráveis em *Configurações*)

- 4 bimestres; em cada um vale a **maior** entre nota e recuperação do bimestre.
- Média anual = média dos 4 bimestres. Abaixo da média de aprovação, a **recuperação final** substitui a média se for maior.
- Frequência = (aulas − faltas) / aulas. Abaixo do mínimo → *Reprovado por falta*.

## Catraca Control iD

1. No equipamento: IP fixo na mesma rede do servidor; anote usuário/senha da interface web (padrão admin/admin).
2. No sistema: *Catraca facial › Equipamentos › Novo equipamento* e clique em **Testar conexão**.
3. Cadastre a foto do aluno (arquivo ou webcam) e clique em **Enviar para catraca** (ou *Enviar pendentes* para todos).
4. Os registros de passagem são buscados automaticamente a cada 30 s (configurável) e aparecem em *Painel e acessos*.
   Na chamada, o professor vê quem passou pela catraca e pode usar o botão *Usar registros da catraca*.

Detalhes técnicos:
- O aluno é cadastrado no equipamento com o **mesmo ID** do sistema e a matrícula como *registration*.
- **Bloquear** remove o aluno do grupo de acesso 1 (grupo padrão de fábrica): a face continua no equipamento, mas o acesso é negado.
  Se o seu equipamento usa outro grupo/regra de acesso, ajuste `this.grupo` em `server/controlid.js`.
- Sentido: equipamento “só entrada”, “só saída” ou “pelo portal” (catraca bidirecional; o nº do portal de entrada é configurável).
- Se os horários aparecerem deslocados, troque *Configurações › Catraca › Hora dos registros*.

### Testar sem o equipamento

```bash
npm run mock-catraca      # simulador em http://localhost:8090
```
Cadastre um equipamento com IP `127.0.0.1`, porta `8090`, usuário/senha `admin`. O simulador gera uma passagem a cada 15 s.

## Usar em outros computadores da escola

O servidor escuta em todas as interfaces: nos outros PCs acesse `http://IP-DO-SERVIDOR:3001`.
Libere a porta 3001 no firewall do Windows. Observação: a captura de foto pela **webcam** só funciona
em `localhost` ou HTTPS (regra dos navegadores); nos outros PCs use a opção *Arquivo*.
