"""
User Management API
Handles user registration, approval workflow, role/team assignment.
Integrates with Clerk (frontend auth) but maintains its own approval + tagging store.
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
import uuid
import json
import sqlite3
import logging
from pathlib import Path


router = APIRouter()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# SQLite-backed user registry — survives restarts
# ---------------------------------------------------------------------------

VALID_ROLES = {"admin", "editor", "viewer", "readonly"}
VALID_TEAMS = {
    "Platform", "SRE", "DevOps", "Security", "Finance",
    "Compliance", "Analytics", "Payments", "Frontend",
    "Infrastructure", "ML/AI", "Data Engineering",
}

_DB_PATH = Path(__file__).parent.parent / "data" / "k8s_optimization.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def _init_users_table():
    """Create platform_users table if it doesn't exist."""
    Path(_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS platform_users (
                id TEXT PRIMARY KEY,
                clerk_user_id TEXT UNIQUE NOT NULL,
                username TEXT NOT NULL,
                email TEXT NOT NULL,
                full_name TEXT DEFAULT '',
                role TEXT DEFAULT 'viewer',
                teams TEXT DEFAULT '[]',
                status TEXT DEFAULT 'pending',
                mfa_enabled INTEGER DEFAULT 0,
                last_login TEXT,
                registered_at TEXT NOT NULL,
                approved_at TEXT,
                approved_by TEXT,
                notes TEXT
            )
        """)
        # Remove legacy seed admin if it still exists in the DB
        conn.execute("DELETE FROM platform_users WHERE id = 'seed_admin_001'")


_init_users_table()


def _row_to_dict(row) -> dict:
    d = dict(row)
    d["teams"] = json.loads(d.get("teams") or "[]")
    d["mfa_enabled"] = bool(d.get("mfa_enabled", 0))
    return d


# ---------------------------------------------------------------------------
# Registry helpers (read / write through SQLite)
# ---------------------------------------------------------------------------

class USER_REGISTRY:
    """Thin wrapper so existing call-sites work unchanged."""

    @staticmethod
    def get(uid: str) -> Optional[dict]:
        with _get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM platform_users WHERE id = ?", (uid,)
            ).fetchone()
        return _row_to_dict(row) if row else None

    @staticmethod
    def values() -> List[dict]:
        with _get_conn() as conn:
            rows = conn.execute("SELECT * FROM platform_users").fetchall()
        return [_row_to_dict(r) for r in rows]

    @staticmethod
    def __contains__(uid: str) -> bool:
        with _get_conn() as conn:
            row = conn.execute(
                "SELECT id FROM platform_users WHERE id = ?", (uid,)
            ).fetchone()
        return row is not None

    @staticmethod
    def save(user: dict):
        """Insert or replace a user record."""
        with _get_conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO platform_users
                  (id, clerk_user_id, username, email, full_name, role, teams,
                   status, mfa_enabled, last_login, registered_at, approved_at,
                   approved_by, notes)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                user["id"], user["clerk_user_id"], user["username"],
                user["email"], user.get("full_name", ""),
                user["role"], json.dumps(user.get("teams", [])),
                user["status"], int(user.get("mfa_enabled", False)),
                user.get("last_login"), user["registered_at"],
                user.get("approved_at"), user.get("approved_by"),
                user.get("notes"),
            ))

    @staticmethod
    def update(uid: str, fields: dict):
        """Patch individual fields on an existing record."""
        user = USER_REGISTRY.get(uid)
        if user is None:
            return
        user.update(fields)
        USER_REGISTRY.save(user)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class UserRegistrationRequest(BaseModel):
    clerk_user_id: str
    username: str
    email: str
    full_name: str = ""
    requested_role: str = "viewer"
    requested_teams: List[str] = []


class UserApprovalRequest(BaseModel):
    status: str           # approved | rejected | suspended
    role: Optional[str] = None
    teams: Optional[List[str]] = None
    notes: Optional[str] = None


class UserUpdateRequest(BaseModel):
    role: Optional[str] = None
    teams: Optional[List[str]] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    clerk_user_id: str
    username: str
    email: str
    full_name: str
    role: str
    teams: List[str]
    status: str
    mfa_enabled: bool
    last_login: Optional[str]
    registered_at: str
    approved_at: Optional[str]
    approved_by: Optional[str]
    notes: Optional[str]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _to_response(u: dict) -> UserResponse:
    return UserResponse(
        id=u["id"],
        clerk_user_id=u["clerk_user_id"],
        username=u["username"],
        email=u["email"],
        full_name=u.get("full_name", ""),
        role=u["role"],
        teams=u.get("teams", []),
        status=u["status"],
        mfa_enabled=u.get("mfa_enabled", False),
        last_login=u.get("last_login"),
        registered_at=u["registered_at"],
        approved_at=u.get("approved_at"),
        approved_by=u.get("approved_by"),
        notes=u.get("notes"),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", response_model=UserResponse, status_code=201)
async def register_user(req: UserRegistrationRequest):
    """
    Called after a Clerk sign-up to register the user in the platform store.
    The very first user to register is automatically approved as admin so the
    platform is immediately usable without a chicken-and-egg approval problem.
    Subsequent users start in 'pending' state until an admin approves.
    If the user already exists (re-registration after logout) we return the
    existing record so the frontend can show the current status.
    """
    # Return existing record if already registered
    existing = next(
        (u for u in USER_REGISTRY.values() if u["clerk_user_id"] == req.clerk_user_id),
        None,
    )
    if existing:
        return _to_response(existing)

    # Validate requested role & teams
    role = req.requested_role if req.requested_role in VALID_ROLES else "viewer"
    teams = [t for t in req.requested_teams if t in VALID_TEAMS]

    # First user ever → auto-approve as admin so the app is immediately usable
    all_users = USER_REGISTRY.values()
    is_first_user = len(all_users) == 0

    uid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    user = {
        "id": uid,
        "clerk_user_id": req.clerk_user_id,
        "username": req.username,
        "email": req.email,
        "full_name": req.full_name,
        "role": "admin" if is_first_user else role,
        "teams": teams,
        "status": "approved" if is_first_user else "pending",
        "mfa_enabled": False,
        "last_login": None,
        "registered_at": now,
        "approved_at": now if is_first_user else None,
        "approved_by": "system" if is_first_user else None,
        "notes": "Auto-approved: first user" if is_first_user else None,
    }
    USER_REGISTRY.save(user)
    if is_first_user:
        logger.info(f"First user auto-approved as admin: {req.email} (clerk_id={req.clerk_user_id})")
    else:
        logger.info(f"New user registered (pending): {req.email} (clerk_id={req.clerk_user_id})")
    return _to_response(user)


@router.get("/status/{clerk_user_id}")
async def get_user_status(clerk_user_id: str):
    """
    Check whether a Clerk user has been approved by an admin.
    Called by the frontend after sign-in to decide whether to show the
    'Pending Approval' screen or allow entry into the platform.
    """
    user = next(
        (u for u in USER_REGISTRY.values() if u["clerk_user_id"] == clerk_user_id),
        None,
    )
    if not user:
        # Unknown → treat as pending (they need to register first)
        return {"status": "unregistered", "role": None, "teams": []}

    return {
        "status": user["status"],
        "role": user["role"],
        "teams": user.get("teams", []),
    }


# ── Public read endpoints ─────────────────────────────────────────────────

@router.get("/access-review", response_model=List[UserResponse])
async def list_users_for_access_review(status_filter: Optional[str] = None):
    """
    Return all platform users for the Access Reviews page.
    No auth required — the page itself is already behind Clerk's ProtectedRoute.
    """
    users = list(USER_REGISTRY.values())
    if status_filter:
        users = [u for u in users if u["status"] == status_filter]
    return [_to_response(u) for u in users]


# ── Admin-only endpoints ──────────────────────────────────────────────────

@router.get("/", response_model=List[UserResponse])
async def list_users(status_filter: Optional[str] = None):
    """List all platform users."""
    users = list(USER_REGISTRY.values())
    if status_filter:
        users = [u for u in users if u["status"] == status_filter]
    return [_to_response(u) for u in users]


@router.get("/pending", response_model=List[UserResponse])
async def list_pending_users():
    """List users awaiting admin approval."""
    pending = [u for u in USER_REGISTRY.values() if u["status"] == "pending"]
    return [_to_response(u) for u in pending]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    """Get a single user by platform id."""
    user = USER_REGISTRY.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _to_response(user)


@router.post("/{user_id}/approve", response_model=UserResponse)
async def approve_or_reject_user(
    user_id: str,
    req: UserApprovalRequest,
):
    """Approve, reject, or suspend a user. Optionally assign a role and teams at approval time."""
    user = USER_REGISTRY.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    valid_statuses = {"approved", "rejected", "suspended", "pending"}
    if req.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")

    fields: dict = {"status": req.status}
    if req.role and req.role in VALID_ROLES:
        fields["role"] = req.role
    if req.teams is not None:
        fields["teams"] = [t for t in req.teams if t in VALID_TEAMS]
    if req.notes is not None:
        fields["notes"] = req.notes
    if req.status == "approved":
        fields["approved_at"] = datetime.utcnow().isoformat()
        fields["approved_by"] = "admin"

    USER_REGISTRY.update(user_id, fields)
    user = USER_REGISTRY.get(user_id)
    logger.info(f"User {user_id} ({user['email']}) set to '{req.status}'")
    return _to_response(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    req: UserUpdateRequest,
):
    """Update role, teams, status, or notes for a user."""
    user = USER_REGISTRY.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    fields: dict = {}
    if req.role is not None:
        if req.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of {VALID_ROLES}")
        fields["role"] = req.role
    if req.teams is not None:
        fields["teams"] = [t for t in req.teams if t in VALID_TEAMS]
    if req.status is not None:
        fields["status"] = req.status
    if req.notes is not None:
        fields["notes"] = req.notes

    USER_REGISTRY.update(user_id, fields)
    user = USER_REGISTRY.get(user_id)
    logger.info(f"User {user_id} updated")
    return _to_response(user)


@router.delete("/{user_id}", status_code=204)
async def deactivate_user(user_id: str):
    """Deactivate (soft-delete by setting suspended) a user."""
    target = USER_REGISTRY.get(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    USER_REGISTRY.update(user_id, {"status": "suspended"})
    logger.info(f"User {user_id} suspended")


@router.get("/meta/roles")
async def list_valid_roles():
    """Return valid roles for UI dropdowns."""
    return {"roles": sorted(VALID_ROLES)}


@router.get("/meta/teams")
async def list_valid_teams():
    """Return valid teams for UI dropdowns."""
    return {"teams": sorted(VALID_TEAMS)}


# Made with Bob
