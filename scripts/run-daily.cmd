@echo off
rem Täglicher PCG-Agent-Lauf (Daily-Briefing) - wird vom Windows Task Scheduler aufgerufen.
setlocal
cd /d "%~dp0.."

rem Stelle sicher, dass Node/npm und Standardpfade im PATH sind
set "PATH=%LOCALAPPDATA%\hermes\node;%ProgramFiles%\nodejs;%PATH%"

set "LOGDIR=%~dp0..\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [%date% %time%] Starte PCG Agent Daily >> "%LOGDIR%\daily.log"
call npm.cmd run agent -- daily >> "%LOGDIR%\daily.log" 2>&1
echo [%date% %time%] Beendet mit Exit Code %ERRORLEVEL% >> "%LOGDIR%\daily.log"
endlocal
