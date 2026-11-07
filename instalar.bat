@echo off
chcp 65001 >nul
title Bitu - instalar e rodar
echo.
echo  ==== Bitu ====
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Precisa do Node.js. Vou abrir a pagina de download.
  echo  Instale a versao LTS e rode este arquivo de novo.
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo  Instalando dependencias (so na primeira vez)...
  call npm install
  if errorlevel 1 ( echo  Algo deu errado na instalacao. & pause & exit /b 1 )
)
echo  Abrindo o Bitu...
call npm start
