"""Integration tests for the enterprise multi-tenant + Paystack billing API."""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta


def _bootstrap_org(client, *, name: str, admin_email: str) -> dict:
    response = client.post("/v1/enterprise/bootstrap", json={
        "organizationName": name,
        "adminName": "Test Admin",
        "adminEmail": admin_email,
        "seats": 5,
        "scanQuota": 100,
    })
    assert response.status_code == 200, response.text
    return response.json()


def _login_as(app_module, client, email: str) -> str:
    """Trigger the OTP flow and return a JWT token."""
    email = email.strip().lower()
    response = client.post("/v1/auth/admin/send-otp", json={"email": email})
    assert response.status_code == 200, response.text
    code = app_module._otp_store[email]["code"]
    verify = client.post("/v1/auth/admin/verify-otp", json={"email": email, "code": code})
    assert verify.status_code == 200, verify.text
    return verify.json()["token"]


# --- Auth / OTP ---

def test_send_otp_returns_200_for_unknown_email(client):
    response = client.post("/v1/auth/admin/send-otp", json={"email": "ghost@example.com"})
    assert response.status_code == 200
    # Security: should not reveal whether the email exists
    assert response.json() == {"sent": True}


def test_verify_otp_issues_jwt_with_role_and_org(app_module, client):
    org = _bootstrap_org(client, name="Verify OTP Co", admin_email="owner1@example.com")
    token = _login_as(app_module, client, "owner1@example.com")
    decoded = app_module._decode_jwt(token)
    assert decoded["email"] == "owner1@example.com"
    assert decoded["role"] == "org_owner"
    assert decoded["organization_id"] == org["organizationId"]


# --- RBAC ---

def test_org_dashboard_denies_other_org(app_module, client):
    org_a = _bootstrap_org(client, name="Org A", admin_email="ownerA@example.com")
    _bootstrap_org(client, name="Org B", admin_email="ownerB@example.com")
    token_b = _login_as(app_module, client, "ownerB@example.com")
    response = client.get(
        f"/v1/enterprise/organizations/{org_a['organizationId']}/dashboard",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert response.status_code == 403


def test_super_admin_endpoint_requires_super_admin_role(app_module, client):
    _bootstrap_org(client, name="Org C", admin_email="ownerC@example.com")
    token = _login_as(app_module, client, "ownerC@example.com")
    response = client.get(
        "/v1/enterprise/super-admin/dashboard",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


# --- Paystack billing checkout ---

def test_billing_checkout_returns_paystack_url(app_module, client, monkeypatch):
    org = _bootstrap_org(client, name="Bill Co", admin_email="bill@example.com")
    token = _login_as(app_module, client, "bill@example.com")

    def fake_init(org_id, license_id, plan_tier, amount, currency, customer_email):
        return {
            "reference": "tlx_fake_ref_123",
            "checkoutUrl": "https://checkout.paystack.com/abc123",
            "provider": "paystack",
        }

    monkeypatch.setattr(app_module, "_paystack_initialize_transaction", fake_init)

    response = client.post(
        "/v1/enterprise/billing/checkout",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "organizationId": org["organizationId"],
            "licenseId": org["licenseId"],
            "amount": 50000.0,
            "currency": "NGN",
            "billingInterval": "annual",
            "planTier": "growth",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["provider"] == "paystack"
    assert data["checkoutUrl"].startswith("https://checkout.paystack.com")
    assert data["paystackReference"] == "tlx_fake_ref_123"
    assert data["status"] == "pending"


# --- Paystack webhook ---

def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha512).hexdigest()


def test_paystack_webhook_rejects_invalid_signature(client):
    body = json.dumps({"event": "charge.success", "data": {}}).encode("utf-8")
    response = client.post(
        "/v1/billing/webhook",
        content=body,
        headers={"x-paystack-signature": "deadbeef", "Content-Type": "application/json"},
    )
    assert response.status_code == 400


def test_paystack_webhook_charge_success_marks_license_active(app_module, client):
    org = _bootstrap_org(client, name="Webhook Co", admin_email="wh@example.com")
    organization_id = org["organizationId"]
    license_id = org["licenseId"]

    # Seed a pending billing record so the webhook can update it.
    reference = "tlx_webhook_ref_abc"
    conn = app_module._enterprise_connection()
    try:
        conn.execute(
            """
            INSERT INTO billing_records (
                id, organization_id, license_id, amount, currency, status,
                billing_interval, checkout_url, external_reference, created_at, paystack_reference
            ) VALUES (?, ?, ?, ?, ?, 'pending', 'annual', '', ?, ?, ?)
            """,
            (
                "bill_test_1",
                organization_id,
                license_id,
                50000.0,
                "NGN",
                reference,
                app_module._enterprise_now(),
                reference,
            ),
        )
        # Force the license to past_due so we can verify it gets reactivated.
        conn.execute(
            "UPDATE licenses SET status='past_due' WHERE id=?",
            (license_id,),
        )
        conn.commit()
    finally:
        conn.close()

    payload = {
        "event": "charge.success",
        "data": {
            "reference": reference,
            "customer": {"customer_code": "CUS_test_123"},
            "metadata": {
                "org_id": organization_id,
                "license_id": license_id,
                "plan_tier": "growth",
            },
        },
    }
    body = json.dumps(payload).encode("utf-8")
    signature = _sign(app_module.PAYSTACK_SECRET_KEY, body)

    response = client.post(
        "/v1/billing/webhook",
        content=body,
        headers={"x-paystack-signature": signature, "Content-Type": "application/json"},
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"received": True, "event": "charge.success"}

    # Verify side effects.
    conn = app_module._enterprise_connection()
    try:
        billing = conn.execute(
            "SELECT status, paystack_customer_code FROM billing_records WHERE id='bill_test_1'"
        ).fetchone()
        license_row = conn.execute(
            "SELECT status FROM licenses WHERE id=?", (license_id,)
        ).fetchone()
    finally:
        conn.close()

    assert billing["status"] == "paid"
    assert billing["paystack_customer_code"] == "CUS_test_123"
    assert license_row["status"] == "active"
