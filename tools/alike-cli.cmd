@echo off
rem Alike Studio command line export. Run "alike-cli --help" for options.
setlocal
set "ALIKE_LOG=%TEMP%\alike-cli-%RANDOM%%RANDOM%.log"
set "ALIKE_CLI_QUIET=1"
"%~dp0Alike.exe" --cli --log "%ALIKE_LOG%" %*
set "ALIKE_EXIT=%ERRORLEVEL%"
if exist "%ALIKE_LOG%" (
  type "%ALIKE_LOG%"
  del "%ALIKE_LOG%" >nul 2>&1
)
exit /b %ALIKE_EXIT%
