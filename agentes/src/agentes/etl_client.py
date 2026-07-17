"""Cliente HTTP fino del etl-api (Fase 4). Sin lógica de negocio."""

from __future__ import annotations

import os
from typing import Any

import httpx

DEFAULT_BASE = "http://127.0.0.1:8787"


class EtlApiError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


class EtlClient:
    def __init__(self, base_url: str | None = None, timeout: float = 300.0):
        raw = (base_url or os.environ.get("ETL_API_BASE") or DEFAULT_BASE).rstrip("/")
        self.base_url = raw
        self.timeout = timeout

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        with httpx.Client(timeout=self.timeout) as client:
            res = client.request(method, self._url(path), json=json, params=params)
        try:
            body = res.json() if res.content else None
        except Exception:
            body = res.text
        if res.status_code >= 400:
            raise EtlApiError(
                f"{method} {path} → HTTP {res.status_code}",
                status=res.status_code,
                body=body,
            )
        return body

    def create_run(
        self,
        *,
        events_paths: list[str] | None = None,
        excel_path: str | None = None,
        from_day: str | None = None,
        to_day: str | None = None,
        skip_supabase: bool = True,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"skipSupabase": skip_supabase}
        if events_paths:
            payload["eventsPaths"] = events_paths
        if excel_path:
            payload["excelPath"] = excel_path
        if from_day:
            payload["from"] = from_day
        if to_day:
            payload["to"] = to_day
        return self._request("POST", "/api/etl/runs", json=payload)

    def list_runs(self, *, remote: bool = False) -> dict[str, Any]:
        params = {"remote": "1"} if remote else None
        return self._request("GET", "/api/etl/runs", params=params)

    def get_summary(self, run_id: str) -> dict[str, Any]:
        return self._request("GET", f"/api/etl/runs/{run_id}/summary")

    def list_tables(self, run_id: str) -> dict[str, Any]:
        return self._request("GET", f"/api/etl/runs/{run_id}/tables")

    def query_table(
        self,
        run_id: str,
        name: str,
        *,
        limit: int = 100,
        offset: int = 0,
        col: str | None = None,
        eq: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if col is not None:
            params["col"] = col
            params["eq"] = "" if eq is None else eq
        return self._request("GET", f"/api/etl/runs/{run_id}/tables/{name}", params=params)

    def get_circuit_catalog(self) -> dict[str, Any]:
        return self._request("GET", "/api/etl/catalog/circuits")

    def resolve_window(self, from_day: str, to_day: str) -> dict[str, Any]:
        return self._request(
            "GET", "/api/etl/resolve-window",
            params={"from": from_day, "to": to_day},
        )


# API de módulo (funciones síncronas finas)
_default: EtlClient | None = None


def get_client(base_url: str | None = None) -> EtlClient:
    global _default
    if base_url:
        return EtlClient(base_url)
    if _default is None:
        _default = EtlClient()
    return _default


def create_run(**kwargs: Any) -> dict[str, Any]:
    return get_client().create_run(**kwargs)


def list_runs(**kwargs: Any) -> dict[str, Any]:
    return get_client().list_runs(**kwargs)


def get_summary(run_id: str) -> dict[str, Any]:
    return get_client().get_summary(run_id)


def list_tables(run_id: str) -> dict[str, Any]:
    return get_client().list_tables(run_id)


def query_table(run_id: str, name: str, **kwargs: Any) -> dict[str, Any]:
    return get_client().query_table(run_id, name, **kwargs)


def get_circuit_catalog() -> dict[str, Any]:
    return get_client().get_circuit_catalog()


def resolve_window(from_day: str, to_day: str) -> dict[str, Any]:
    return get_client().resolve_window(from_day, to_day)
