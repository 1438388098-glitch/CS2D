@echo off
cd /d "%~dp0"
echo 启动 CS2D 服务器...
start "" http://localhost:8080
node server.js
pause
