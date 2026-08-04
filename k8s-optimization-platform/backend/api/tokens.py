"""
Token Management API
Generate and manage API tokens for cluster agents.
Tokens are persisted in the same Postgres DB used by the agent receiver so
they survive backend restarts.  Falls back to an in-memory dict when the DB
is unavailable (local dev without Postgres).
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import secrets
import hashlib
import json
import logging
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tokens", tags=["tokens"])

# Admin token for token management (set via environment variable)
ADMIN_TOKEN = os.getenv('ADMIN_TOKEN', 'admin-secret-token-change-me')

# ---------------------------------------------------------------------------
# Persistent token store backed by Postgres (same DB as agent_clusters).
# Falls back to in-memory dict when DB is not available.
# ---------------------------------------------------------------------------

def _get_db():
    """Return the shared DatabaseManager, or None if unavailable."""
    try:
        from database.db import db_manager
        if db_manager._pool is not None:
            return db_manager
    except Exception:
        pass
    return None


def _ensure_tokens_table():
    """Create api_tokens table if it doesn't exist yet."""
    db = _get_db()
    if db is None:
        return
    try:
        with db._conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS api_tokens (
                    token_hash   TEXT PRIMARY KEY,
                    name         TEXT NOT NULL,
                    description  TEXT,
                    created_at   TEXT NOT NULL,
                    expires_at   TEXT,
                    last_used    TEXT,
                    usage_count  INTEGER DEFAULT 0,
                    status       TEXT NOT NULL DEFAULT 'active',
                    org_id       TEXT NOT NULL DEFAULT 'default'
                )
            """)
            conn.commit()
    except Exception as e:
        logger.warning(f"Could not create api_tokens table: {e}")


_ensure_tokens_table()

# In-memory fallback (used only when Postgres is unavailable)
_fallback_tokens: dict = {}


def _load_token(token_hash: str) -> Optional[dict]:
    db = _get_db()
    if db:
        try:
            with db._conn() as conn:
                cur = conn.cursor()
                cur.execute("SELECT * FROM api_tokens WHERE token_hash = %s", (token_hash,))
                row = cur.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.warning(f"DB token load failed: {e}")
    return _fallback_tokens.get(token_hash)


def _save_token(info: dict):
    db = _get_db()
    if db:
        try:
            with db._conn() as conn:
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO api_tokens
                        (token_hash, name, description, created_at, expires_at,
                         last_used, usage_count, status, org_id)
                    VALUES (%(token_hash)s, %(name)s, %(description)s, %(created_at)s,
                            %(expires_at)s, %(last_used)s, %(usage_count)s,
                            %(status)s, %(org_id)s)
                    ON CONFLICT (token_hash) DO UPDATE SET
                        name        = EXCLUDED.name,
                        description = EXCLUDED.description,
                        expires_at  = EXCLUDED.expires_at,
                        last_used   = EXCLUDED.last_used,
                        usage_count = EXCLUDED.usage_count,
                        status      = EXCLUDED.status,
                        org_id      = EXCLUDED.org_id
                """, info)
                conn.commit()
                return
        except Exception as e:
            logger.warning(f"DB token save failed, using in-memory fallback: {e}")
    _fallback_tokens[info["token_hash"]] = info


def _all_tokens() -> List[dict]:
    db = _get_db()
    if db:
        try:
            with db._conn() as conn:
                cur = conn.cursor()
                cur.execute("SELECT * FROM api_tokens ORDER BY created_at DESC")
                return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.warning(f"DB token list failed: {e}")
    return list(_fallback_tokens.values())


def _update_token(token_hash: str, fields: dict):
    info = _load_token(token_hash)
    if info is None:
        return
    info.update(fields)
    _save_token(info)


# Thin compatibility shim so existing call-sites that do `tokens_db[hash]`
# still work without changes.
class _TokensDB:
    def get(self, key, default=None):
        return _load_token(key) or default

    def __contains__(self, key):
        return _load_token(key) is not None

    def __getitem__(self, key):
        val = _load_token(key)
        if val is None:
            raise KeyError(key)
        return val

    def __setitem__(self, key, value):
        _save_token(value)

    def values(self):
        return _all_tokens()


tokens_db = _TokensDB()


class TokenCreate(BaseModel):
    """Token creation request"""
    name: str
    description: Optional[str] = None
    expires_in_days: Optional[int] = 365  # Default 1 year
    org_id: str = "default"


class TokenResponse(BaseModel):
    """Token creation response"""
    token: str
    name: str
    description: Optional[str]
    created_at: str
    expires_at: Optional[str]
    token_hash: str


class TokenInfo(BaseModel):
    """Token information (without actual token)"""
    token_hash: str
    name: str
    description: Optional[str]
    created_at: str
    expires_at: Optional[str]
    last_used: Optional[str]
    usage_count: int
    status: str
    org_id: str = "default"


def verify_admin_token(authorization: str = Header(None)) -> bool:
    """Verify admin token for token management"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    token = authorization.replace("Bearer ", "")
    
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid admin token")
    
    return True


def hash_token(token: str) -> str:
    """Hash token for storage"""
    return hashlib.sha256(token.encode()).hexdigest()


def get_token_org(token: str) -> str:
    """Return the org_id associated with a bearer token, or 'default' if unknown."""
    token_hash = hash_token(token)
    info = tokens_db.get(token_hash)
    if info and info.get("status") == "active":
        return info.get("org_id", "default")
    return "default"


@router.post("/generate", response_model=TokenResponse)
async def generate_token(
    token_create: TokenCreate,
    admin: bool = Depends(verify_admin_token)
):
    """
    Generate a new API token for cluster agents
    
    Requires admin authentication
    """
    # Generate secure random token
    token = secrets.token_urlsafe(32)
    token_hash = hash_token(token)
    
    # Calculate expiration
    created_at = datetime.utcnow()
    expires_at = None
    if token_create.expires_in_days:
        expires_at = created_at + timedelta(days=token_create.expires_in_days)
    
    # Store token info
    tokens_db[token_hash] = {
        "token_hash": token_hash,
        "name": token_create.name,
        "description": token_create.description,
        "created_at": created_at.isoformat(),
        "expires_at": expires_at.isoformat() if expires_at else None,
        "last_used": None,
        "usage_count": 0,
        "status": "active",
        "org_id": token_create.org_id or "default",
    }
    
    return TokenResponse(
        token=token,
        name=token_create.name,
        description=token_create.description,
        created_at=created_at.isoformat(),
        expires_at=expires_at.isoformat() if expires_at else None,
        token_hash=token_hash
    )


@router.get("/list", response_model=List[TokenInfo])
async def list_tokens(admin: bool = Depends(verify_admin_token)):
    """
    List all tokens (without revealing actual token values)
    
    Requires admin authentication
    """
    return [TokenInfo(**token_info) for token_info in tokens_db.values()]


@router.get("/{token_hash}", response_model=TokenInfo)
async def get_token_info(
    token_hash: str,
    admin: bool = Depends(verify_admin_token)
):
    """
    Get information about a specific token
    
    Requires admin authentication
    """
    if token_hash not in tokens_db:
        raise HTTPException(status_code=404, detail="Token not found")
    
    return TokenInfo(**tokens_db[token_hash])


@router.delete("/{token_hash}")
async def revoke_token(
    token_hash: str,
    admin: bool = Depends(verify_admin_token)
):
    """
    Revoke a token
    
    Requires admin authentication
    """
    if token_hash not in tokens_db:
        raise HTTPException(status_code=404, detail="Token not found")

    _update_token(token_hash, {"status": "revoked"})
    
    return {
        "status": "success",
        "message": f"Token {token_hash[:8]}... revoked"
    }


@router.post("/verify")
async def verify_token(authorization: str = Header(None)):
    """
    Verify if a token is valid
    
    Used by agents to check token validity
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    token = authorization.replace("Bearer ", "")
    token_hash = hash_token(token)
    
    if token_hash not in tokens_db:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    token_info = tokens_db[token_hash]
    
    # Check if token is revoked
    if token_info["status"] == "revoked":
        raise HTTPException(status_code=401, detail="Token has been revoked")
    
    # Check if token is expired
    if token_info["expires_at"]:
        expires_at = datetime.fromisoformat(token_info["expires_at"])
        if datetime.utcnow() > expires_at:
            raise HTTPException(status_code=401, detail="Token has expired")
    
    # Update usage stats (persist to DB)
    _update_token(token_hash, {
        "last_used": datetime.utcnow().isoformat(),
        "usage_count": (token_info.get("usage_count") or 0) + 1,
    })
    
    return {
        "status": "valid",
        "token_hash": token_hash,
        "name": token_info["name"],
        "expires_at": token_info["expires_at"],
        "org_id": token_info.get("org_id", "default"),
    }


@router.get("/health")
async def token_service_health():
    """Health check for token service"""
    all_t = _all_tokens()
    return {
        "status": "healthy",
        "total_tokens": len(all_t),
        "active_tokens": sum(1 for t in all_t if t["status"] == "active"),
        "revoked_tokens": sum(1 for t in all_t if t["status"] == "revoked"),
        "storage": "postgres" if _get_db() else "in-memory",
    }

# Made with Bob
