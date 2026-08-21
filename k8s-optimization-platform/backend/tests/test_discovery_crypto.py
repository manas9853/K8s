"""
Self-check for api/discovery.py's crypto: the Fernet encrypt/decrypt
round-trip (replaces the old base64 placeholder) and the GCP service
account JWT signing (real RSA key, verified against Google's own expected
JWT-bearer shape) — no network calls, no live cloud credentials needed.
"""
import base64
import json
import os
import sys

import pytest
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/testdb")
os.environ["DISCOVERY_ENCRYPTION_KEY"] = Fernet.generate_key().decode()

from api import discovery  # noqa: E402


def test_encrypt_decrypt_round_trip():
    secret = "super-secret-service-account-key"
    enc = discovery._encrypt_key(secret)
    assert enc != secret
    assert discovery._decrypt_key(enc) == secret


def test_decrypt_rejects_tampered_ciphertext():
    enc = discovery._encrypt_key("some-secret")
    tampered = enc[:-4] + "abcd"
    with pytest.raises(Exception):
        discovery._decrypt_key(tampered)


def test_encrypt_raises_without_key_configured(monkeypatch):
    monkeypatch.delenv("DISCOVERY_ENCRYPTION_KEY", raising=False)
    with pytest.raises(RuntimeError, match="DISCOVERY_ENCRYPTION_KEY"):
        discovery._encrypt_key("anything")


def test_google_service_account_jwt_shape():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    sa_json = {
        "client_email": "billing-reader@my-project.iam.gserviceaccount.com",
        "private_key": pem,
        "private_key_id": "test-key-id",
    }

    jwt = discovery._google_service_account_jwt_sync(sa_json)
    header_b64, claims_b64, sig_b64 = jwt.split(".")

    def _pad(b64: str) -> str:
        return b64 + "=" * (-len(b64) % 4)

    header = json.loads(base64.urlsafe_b64decode(_pad(header_b64)))
    claims = json.loads(base64.urlsafe_b64decode(_pad(claims_b64)))

    assert header == {"alg": "RS256", "typ": "JWT", "kid": "test-key-id"}
    assert claims["iss"] == sa_json["client_email"]
    assert claims["aud"] == "https://oauth2.googleapis.com/token"
    assert claims["scope"] == "https://www.googleapis.com/auth/bigquery.readonly"
    assert claims["exp"] > claims["iat"]
    assert len(base64.urlsafe_b64decode(_pad(sig_b64))) == 256  # RSA-2048 signature size
