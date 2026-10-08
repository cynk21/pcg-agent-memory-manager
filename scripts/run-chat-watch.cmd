@echo off
rem Startet den Chat-Watcher (15s-Polling auf den Google-Chat-Raum) - Task Scheduler / Autostart.
setlocal
cd /d "%~dp0.."

rem Stelle sicher, dass Node/npm und Standardpfade im PATH sind
set "PATH=%LOCALAPPDATA%\hermes\node;%ProgramFiles%\nodejs;%PATH%"

set "LOGDIR=%~dp0..\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [%date% %time%] Starte PCG Agent Chat Watch >> "%LOGDIR%\chat-watch.log"
call npm.cmd run agent -- chat-watch >> "%LOGDIR%\chat-watch.log" 2>&1
echo [%date% %time%] Beendet mit Exit Code %ERRORLEVEL% >> "%LOGDIR%\chat-watch.log"
endlocal
