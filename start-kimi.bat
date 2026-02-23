@echo off
chcp 65001 >nul
setlocal

:: ============================================
:: Kimi Code Quick Start Script
:: ============================================

:: Set working directory
set "WORK_DIR=%~dp0"
cd /d "%WORK_DIR%"

echo ============================================
echo     Kimi Code Quick Start
echo ============================================
echo.

:: ============================================
:: Configuration - Modify as needed
:: ============================================

:: API Base URL (leave empty for default)
set "KIMI_BASE_URL=https://integrate.api.nvidia.com/v1"

:: API Key (leave empty for default)
set "KIMI_API_KEY=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"

:: Model name (leave empty for default)
set "KIMI_MODEL=moonshotai/kimi-k2.5"

:: Agent config file path (relative)
set "AGENT_FILE=.agents\agent.yaml"

:: ============================================
echo Current Configuration:
echo   Working Dir: %WORK_DIR%
echo   Agent Config: %AGENT_FILE%
if not "%KIMI_BASE_URL%"=="" echo   Base URL: %KIMI_BASE_URL%
if not "%KIMI_API_KEY%"=="" echo   API Key: ***SET***
if not "%KIMI_MODEL%"=="" echo   Model: %KIMI_MODEL%
echo.
echo ============================================
echo.

:: Check if kimi command is available
where kimi >nul 2>&1
if errorlevel 1 (
    echo [ERROR] kimi command not found
    echo Please ensure Kimi Code CLI is installed and in PATH
    pause
    exit /b 1
)

:: Set environment variables and start
echo Starting Kimi Code...
echo.

:: Export environment variables
if not "%KIMI_BASE_URL%"=="" set "OPENAI_BASE_URL=%KIMI_BASE_URL%"
if not "%KIMI_API_KEY%"=="" set "OPENAI_API_KEY=%KIMI_API_KEY%"
if not "%KIMI_MODEL%"=="" set "KIMI_MODEL_NAME=%KIMI_MODEL%"

:: Start Kimi Code
kimi --agent-file "%AGENT_FILE%"

echo.
echo Kimi Code exited
pause
