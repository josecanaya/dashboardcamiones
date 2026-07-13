"""Tests del etl_client contra el server local (levanta uno efímero si hace falta)."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import time
from pathlib import Path

import httpx
import pytest

from agentes.etl_client import EtlClient, EtlApiError

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = "tests/fixtures/etl/s-events-slice.json"
SERVER_SCRIPT = REPO_ROOT / "server" / "truckflow-local-server.mjs"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _etl_ready(base: str) -> bool:
    try:
        r = httpx.get(f"{base}/api/etl/runs", timeout=2.0)
        if not r.is_success:
            return False
        body = r.json()
        return isinstance(body.get("runs"), list)
    except Exception:
        return False


@pytest.fixture(scope="module")
def etl_base():
    env_base = os.environ.get("ETL_API_BASE", "").rstrip("/")
    if env_base and _etl_ready(env_base):
        yield env_base
        return

    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    env = {**os.environ, "TRUCKFLOW_LOCAL_SERVER_PORT": str(port)}
    proc = subprocess.Popen(
        ["node", str(SERVER_SCRIPT)],
        cwd=str(REPO_ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.time() + 25
        while time.time() < deadline:
            if proc.poll() is not None:
                raise RuntimeError(f"server salió con code={proc.returncode}")
            if _etl_ready(base):
                break
            time.sleep(0.2)
        else:
            raise RuntimeError(f"timeout esperando {base}")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


@pytest.fixture(scope="module")
def client(etl_base: str) -> EtlClient:
    return EtlClient(etl_base)


@pytest.fixture(scope="module")
def run_id(client: EtlClient) -> str:
    out = client.create_run(events_paths=[FIXTURE], skip_supabase=True)
    assert "runId" in out
    return str(out["runId"])


def test_create_and_list(client: EtlClient, run_id: str):
    listed = client.list_runs()
    assert any(r.get("runId") == run_id for r in listed.get("runs", []))


def test_summary_shape(client: EtlClient, run_id: str):
    summary = client.get_summary(run_id)
    assert summary.get("runId") == run_id
    ex = (summary.get("stats") or {}).get("executive")
    assert isinstance(ex, dict)
    assert "committeeCompletos" in ex


def test_tables_and_query(client: EtlClient, run_id: str):
    tables = client.list_tables(run_id)
    names = tables.get("tables") or []
    assert len(names) >= 10
    assert "final_circuits" in names
    rows = client.query_table(run_id, "final_circuits", limit=5)
    assert isinstance(rows.get("rows"), list)
    assert isinstance(rows.get("headers"), list)
    assert rows.get("total", 0) >= 1


def test_circuit_catalog(client: EtlClient, run_id: str):
    # El catálogo se escribe al correr el headless
    cat = client.get_circuit_catalog()
    assert cat.get("catalog") is not None


def test_bad_run_404(client: EtlClient):
    with pytest.raises(EtlApiError) as ei:
        client.get_summary("no-existe-xyz")
    assert ei.value.status == 404
