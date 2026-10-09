"""Entrada estable: no depende de una instalación editable con rutas antiguas."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / 'prototipo-mcp-local'))
from agentes.mcp_server import main
if __name__ == '__main__':
    main()
