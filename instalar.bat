@echo off
setlocal
chcp 65001 >nul
title Bitu
cd /d "%~dp0"

echo.
echo   ===== Bitu =====
echo.

if not exist "package.json" goto :semzip

where node >nul 2>nul
if errorlevel 1 goto :semnode

echo   Node.js encontrado: 
node -v

if exist "node_modules\electron\dist\electron.exe" goto :abrir

echo.
echo   Instalando as dependencias. So na primeira vez, pode levar uns minutos...
echo.
call npm install
if errorlevel 1 goto :erroinstall

:abrir
echo.
echo   Abrindo o Bitu. Ele aparece em cima do relogio do Windows.
echo   Pode deixar esta janela aberta; fechar ela fecha o Bitu.
echo.
call npm start
if errorlevel 1 goto :erroabrir
goto :fim

:semzip
echo   Nao achei os arquivos do projeto ao lado deste .bat.
echo   Descompacte o bitu.zip inteiro numa pasta antes
echo   e rode o instalar.bat de dentro dela.
goto :fim

:semnode
echo   Para rodar a partir do codigo, precisa do Node.js.
echo   Vou abrir a pagina de download: instale a versao LTS,
echo   feche esta janela e rode o instalar.bat de novo.
start "" https://nodejs.org
goto :fim

:erroinstall
echo.
echo   A instalacao das dependencias falhou. Veja a mensagem acima.
echo   Dica: confira a internet e tente de novo.
goto :fim

:erroabrir
echo.
echo   O Bitu fechou com erro. Veja a mensagem acima.

:fim
echo.
pause
