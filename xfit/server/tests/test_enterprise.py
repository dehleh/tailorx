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


def _ensure_super_admin(app_module, email: str = "platform-admin@example.com") -> str:
    conn = app_module._enterprise_connection()
    try:
        existing = conn.execute(
            "SELECT email FROM organization_users WHERE role='super_admin' LIMIT 1"
        ).fetchone()
        if existing:
            return existing["email"]
        conn.execute(
            """
            INSERT INTO organization_users (id, organization_id, name, email, role, status, created_at)
            VALUES (?, NULL, 'Platform Admin', ?, 'super_admin', 'active', ?)
            """,
            (app_module._new_id("usr"), email, app_module._enterprise_now()),
        )
        conn.commit()
        return email
    finally:
        conn.close()


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


def test_user_profile_sync_round_trip(client):
    payload = {
        "email": "bamidele@example.com",
        "displayName": "Bamidele",
        "gender": "male",
        "heightCm": 180,
        "weightKg": 82,
        "preferredUnit": "cm",
        "country": "Nigeria",
        "preferredStyle": "modern",
        "colorPreference": "neutral",
    }
    saved = client.put("/v1/users/profile", json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["displayName"] == "Bamidele"

    fetched = client.get("/v1/users/profile", params={"email": "bamidele@example.com"})
    assert fetched.status_code == 200, fetched.text
    data = fetched.json()
    assert data["email"] == "bamidele@example.com"
    assert data["heightCm"] == 180
    assert data["preferredStyle"] == "modern"


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


def test_super_admin_operations_console_endpoints(app_module, client):
    org = _bootstrap_org(client, name="Ops Console Co", admin_email="ops-owner@example.com")
    super_email = _ensure_super_admin(app_module)
    token = _login_as(app_module, client, super_email)
    headers = {"Authorization": f"Bearer {token}"}

    dashboard = client.get("/v1/enterprise/super-admin/dashboard", headers=headers)
    assert dashboard.status_code == 200, dashboard.text
    data = dashboard.json()
    assert data["summary"]["databaseStatus"] == "online"
    assert data["summary"]["activeOrganizationCount"] >= 1
    assert "revenueByCurrency" in data["summary"]
    org_rows = [row for row in data["organizations"] if row["id"] == org["organizationId"]]
    assert org_rows
    assert org_rows[0]["owner_email"] == "ops-owner@example.com"

    detail = client.get(
        f"/v1/enterprise/super-admin/organizations/{org['organizationId']}",
        headers=headers,
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["owner"]["email"] == "ops-owner@example.com"
    assert detail.json()["stats"]["user_count"] >= 1

    update = client.patch(
        f"/v1/enterprise/super-admin/organizations/{org['organizationId']}/license",
        headers=headers,
        json={"seats": 12, "scanQuota": 750, "amount": 250000, "currency": "NGN"},
    )
    assert update.status_code == 200, update.text
    assert update.json()["license"]["seats_purchased"] == 12
    assert update.json()["license"]["scan_quota"] == 750
    assert update.json()["license"]["currency"] == "NGN"

    reset = client.post(
        f"/v1/enterprise/super-admin/organizations/{org['organizationId']}/owner-access",
        headers=headers,
        json={"sendOtp": False},
    )
    assert reset.status_code == 200, reset.text
    assert reset.json()["ownerEmail"] == "ops-owner@example.com"
    assert reset.json()["status"] == "active"

    archive = client.post(
        f"/v1/enterprise/super-admin/organizations/{org['organizationId']}/archive",
        headers=headers,
    )
    assert archive.status_code == 200, archive.text
    assert archive.json()["status"] == "archived"


def test_enterprise_session_measurements_appear_on_dashboard(app_module, client):
    org = _bootstrap_org(client, name="Remote Tailor Co", admin_email="tailor@example.com")
    token = _login_as(app_module, client, "tailor@example.com")

    start = client.post(
        f"/v1/enterprise/invite/{org['defaultInviteCode']}/start-session",
        json={
            "customerName": "Ada Client",
            "customerEmail": "ada@example.com",
            "source": "mobile_app",
        },
    )
    assert start.status_code == 200, start.text
    session_id = start.json()["sessionId"]

    complete = client.post(
        f"/v1/enterprise/sessions/{session_id}/complete",
        json={
            "measurementId": "m_ada_001",
            "accuracyScore": 88.5,
            "measurements": {
                "chest": 92.4,
                "underbust": 78.2,
                "waist": 70.1,
                "hips": 96.7,
                "ignoredZero": 0,
            },
            "unit": "cm",
            "measurementProfile": "female",
            "confidence": {"chest": 86, "waist": 91},
            "warnings": ["Side view accepted."],
            "metadata": {"anglesUsed": ["front", "side"], "engineVersion": "test"},
        },
    )
    assert complete.status_code == 200, complete.text
    assert complete.json()["measurementCount"] == 4

    dashboard = client.get(
        f"/v1/enterprise/organizations/{org['organizationId']}/dashboard",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dashboard.status_code == 200, dashboard.text
    session = dashboard.json()["recentSessions"][0]
    assert session["customer_name"] == "Ada Client"
    assert session["measurement_id"] == "m_ada_001"
    assert session["measurement_profile"] == "female"
    assert session["measurements"] == {
        "chest": 92.4,
        "underbust": 78.2,
        "waist": 70.1,
        "hips": 96.7,
    }
    assert session["confidence"]["chest"] == 86
    assert session["warnings"] == ["Side view accepted."]
    assert session["review_status"] == "needs_tailor_review"
    assert session["accuracyStatus"]["coverage"]["requiredCoveragePct"] < 100

    events = client.get(
        f"/v1/enterprise/organizations/{org['organizationId']}/events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert events.status_code == 200, events.text
    event_types = {event["eventType"] for event in events.json()["events"]}
    assert "session_started" in event_types
    assert "session_completed" in event_types

    review = client.post(
        f"/v1/enterprise/sessions/{session_id}/review",
        headers={"Authorization": f"Bearer {token}"},
        json={"reviewStatus": "reviewed", "tailorNotes": "Ready for drafting."},
    )
    assert review.status_code == 200, review.text
    assert review.json()["reviewStatus"] == "reviewed"

    benchmark = client.post(
        f"/v1/enterprise/organizations/{org['organizationId']}/accuracy-benchmarks",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "measurementId": "m_ada_001",
            "measurementProfile": "female",
            "scanMeasurements": {
                "chest": 92.4,
                "waist": 70.1,
                "hips": 96.7,
            },
            "tapeMeasurements": {
                "chest": 93.0,
                "waist": 71.0,
                "hips": 97.0,
            },
        },
    )
    assert benchmark.status_code == 200, benchmark.text
    assert benchmark.json()["errors"]["waist"] == 0.9
    assert benchmark.json()["accuracyCertification"]["sampleSize"] == 1

    dashboard_after_review = client.get(
        f"/v1/enterprise/organizations/{org['organizationId']}/dashboard",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert dashboard_after_review.status_code == 200, dashboard_after_review.text
    reviewed_session = dashboard_after_review.json()["recentSessions"][0]
    assert reviewed_session["review_status"] == "reviewed"
    assert dashboard_after_review.json()["accuracyCertification"]["sampleSize"] == 1
    assert dashboard_after_review.json()["businessHealth"]["reviewBacklog"] == 0
    assert dashboard_after_review.json()["measurementCatalog"]["version"] == "tailorx-iso8559-1-v1"


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


# --- Measurement sharing ---

def test_measurement_share_link_can_be_read_and_revoked(client):
    create = client.post(
        "/v1/shares",
        json={
            "measurementId": "m_test_share_1",
            "measurements": {
                "chest": 101.5,
                "waist": 82.25,
                "ignoredZero": 0,
            },
            "unit": "cm",
            "ttlHours": 1,
            "createdByEmail": "owner@example.com",
        },
    )
    assert create.status_code == 200, create.text
    share = create.json()
    assert share["accessScope"] == "read_only"
    assert "/v1/shares/" in share["shareUrl"]
    assert share["token"] not in share["revokeToken"]

    read = client.get(f"/v1/shares/{share['token']}")
    assert read.status_code == 200, read.text
    data = read.json()
    assert data["measurementId"] == "m_test_share_1"
    assert data["accessScope"] == "read_only"
    assert data["measurements"] == {"chest": 101.5, "waist": 82.25}

    bad_revoke = client.post(
        f"/v1/shares/{share['token']}/revoke",
        json={"revokeToken": "not_the_creator_token"},
    )
    assert bad_revoke.status_code == 403

    revoke = client.post(
        f"/v1/shares/{share['token']}/revoke",
        json={"revokeToken": share["revokeToken"]},
    )
    assert revoke.status_code == 200, revoke.text
    assert revoke.json() == {"revoked": True}

    read_after_revoke = client.get(f"/v1/shares/{share['token']}")
    assert read_after_revoke.status_code == 410


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
