@echo off
chcp 65001 >nul
echo Actualizando la presentacion desde el Excel guardado...
"C:\Users\Usuario\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "%~dp0run-manual.mjs"
if errorlevel 1 (
 echo.
 echo No se pudo generar el informe. Revise el mensaje anterior.
) else (
 echo.
 echo Listo. El PPTX nuevo esta en la carpeta Resultados.
 start "" "%~dp0Resultados"
)
pause

