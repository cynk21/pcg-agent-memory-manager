@echo off
rem Startet den Chat-Watcher (15s-Polling auf den Google-Chat-Raum) - Task Scheduler / Autostart.
cd /d "%~dp0.."
set LOGDIR=%~dp0..\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
call npm run agent -- chat-watch >> "%LOGDIR%\chat-watch.log" 2>&1
