#!/usr/bin/env python3
"""
Self-check for _parse_tls_cert (agent.py). Run directly: python3 test_cert_parse.py
No pytest — generates a real self-signed cert in-memory and asserts real fields
come back correctly, plus that garbage input degrades to parse_error, not a crash.
"""
import base64
import datetime

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from agent import _parse_tls_cert


def _make_self_signed_pem(days_valid: int) -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test.example.com")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=days_valid))
        .sign(key, hashes.SHA256())
    )
    pem = cert.public_bytes(serialization.Encoding.PEM)
    return base64.b64encode(pem).decode()


def demo():
    # Real cert parses to real fields
    cert_b64 = _make_self_signed_pem(90)
    result = _parse_tls_cert(cert_b64)
    assert result is not None
    assert "parse_error" not in result, result
    assert "test.example.com" in result["real_subject"]
    assert "test.example.com" in result["real_issuer"]
    expiry = datetime.datetime.fromisoformat(result["real_expiry"])
    days_left = (expiry - datetime.datetime.now(datetime.timezone.utc)).days
    assert 88 <= days_left <= 90, days_left

    # Garbage input degrades gracefully, never raises
    bad = _parse_tls_cert(base64.b64encode(b"not a cert").decode())
    assert bad is not None and "parse_error" in bad

    # No cert data at all -> None (nothing to ship)
    assert _parse_tls_cert(None) is None
    assert _parse_tls_cert("") is None

    print("OK: _parse_tls_cert real-parse, error-handling, and empty-input checks passed")


if __name__ == "__main__":
    demo()
