"""
Token Management API
Generate and manage API tokens for cluster agents
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import secrets
import hashlib
import json
import os

router = APIRouter(prefix="/api/tokens", tags=["tokens"])

# In-memory token storage (replace with database in production)
# Format: {token_hash: {token_info}}
tokens_db = {}

# Admin token for token management (set via environment variable)
ADMIN_TOKEN = os.getenv('ADMIN_TOKEN', 'admin-secret-token-change-me')


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
    
    tokens_db[token_hash]["status"] = "revoked"
    
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
    
    # Update usage stats
    token_info["last_used"] = datetime.utcnow().isoformat()
    token_info["usage_count"] += 1
    
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
    return {
        "status": "healthy",
        "total_tokens": len(tokens_db),
        "active_tokens": sum(1 for t in tokens_db.values() if t["status"] == "active"),
        "revoked_tokens": sum(1 for t in tokens_db.values() if t["status"] == "revoked")
    }


# Initialize with a default token for testing (remove in production)
if not tokens_db:
    default_token = "test-token-12345"
    default_hash = hash_token(default_token)
    tokens_db[default_hash] = {
        "token_hash": default_hash,
        "name": "Default Test Token",
        "description": "Default token for testing (remove in production)",
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": None,
        "last_used": None,
        "usage_count": 0,
        "status": "active"
    }

# Made with Bob
