"""
Shared secret encryption for anything we store server-side: cloud billing
credentials (api/discovery.py) and CI/CD integration tokens
(api/cicd_integrations.py) both use this.

Fernet (AES-128-CBC + HMAC-SHA256, authenticated) rather than hand-rolled
AES-GCM — same practical security property (a tampered/truncated
ciphertext fails to decrypt instead of silently returning garbage), one
call each way instead of hand-managing nonces/tags.
ponytail: reach for the library before rolling your own.
"""
import os


def _get_fernet():
    from cryptography.fernet import Fernet
    key = os.environ.get("DISCOVERY_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError(
            "DISCOVERY_ENCRYPTION_KEY is not set — cannot store or read "
            "third-party credentials (cloud billing, CI/CD tokens). Generate one with: "
            "python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(raw: str) -> str:
    return _get_fernet().encrypt(raw.encode()).decode()


def decrypt_secret(enc: str) -> str:
    return _get_fernet().decrypt(enc.encode()).decode()
