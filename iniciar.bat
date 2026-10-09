@echo off
REM Inicia o sistema de gestao escolar (porta 3001)
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
if not exist dist (
  echo Gerando interface...
  call npm run build
)
echo Acesse http://localhost:3001  (ou http://IP-DESTE-PC:3001 nos outros computadores)
node --env-file-if-exists=.env server/index.js
pause
