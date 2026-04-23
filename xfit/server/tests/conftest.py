"""Test fixtures for the Tailor-X enterprise API.

Uses an isolated SQLite database per test session and a deterministic
Paystack secret so the webhook signature path can be exercised end-to-end.
"""
from __future__ import annotations

import importlib
import os
import sys
import tempfile
from pathlib import Path

import pytest

# Ensure the server package is importable when tests are run from repo root.
SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


@pytest.fixture(scope="session")
def app_module():
    tmp_db = Path(tempfile.gettempdir()) / "tailorx_test_enterprise.db"
    if tmp_db.exists():
        tmp_db.unlink()
    os.environ["ENTERPRISE_DB_PATH"] = str(tmp_db)
    os.environ["JWT_SECRET"] = "test-jwt-secret-please-change"
    os.environ["PAYSTACK_SECRET_KEY"] = "sk_test_dummy_secret"
    os.environ["WEB_APP_URL"] = "http://localhost:3001"
    os.environ["TAILORX_ALLOWED_ORIGINS"] = "http://localhost:3001"

    if "server" in sys.modules:
        del sys.modules["server"]
    server = importlib.import_module("server")
    server.init_enterprise_db()
    return server


@pytest.fixture(scope="session")
def client(app_module):
    from fastapi.testclient import TestClient
    return TestClient(app_module.app)
