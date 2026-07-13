# Agentes Truckflow / ETL
#
# Setup:
#   cd agentes
#   python -m venv .venv
#   .\.venv\Scripts\Activate.ps1   # Windows
#   pip install -e ".[dev]"
#
# Requiere el server local del repo (Fase 4):
#   npm run server:truckflow
#
# Chat REPL:
#   npm run server:truckflow   # otra terminal
#   cd agentes && .\.venv\Scripts\Activate.ps1
#   copy .env.example .env     # + ANTHROPIC_API_KEY
#   python -m agentes.orquestador
#
# Tests del cliente (levantan server efímero si hace falta):
#   pytest

Ver `docs/migracion/FASE_5_AGENTES_PYTHON.md`.
