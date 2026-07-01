"""
Trivy image scanner service.

Runs `trivy image` as a subprocess, parses the JSON output, and caches
results per image for CACHE_TTL seconds so repeated API calls are fast.

The DOCKER_CONFIG override is required because Docker Desktop installs a
credsStore=desktop helper that is absent inside the container / on CI.
"""

import asyncio
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── configuration ────────────────────────────────────────────────────────────
CACHE_TTL      = int(os.getenv("TRIVY_CACHE_TTL",    str(6 * 3600)))   # 6 h
SCAN_TIMEOUT   = int(os.getenv("TRIVY_TIMEOUT",       "120"))           # seconds
MAX_CONCURRENT = int(os.getenv("TRIVY_MAX_CONCURRENT", "3"))
DB_REPOSITORY  = os.getenv("TRIVY_DB_REPOSITORY", "ghcr.io/aquasecurity/trivy-db")

# Images that cannot be pulled from public registries (private / air-gapped)
# — skip these rather than timing out every scan.
_SKIP_PREFIXES = (
    "de.icr.io/",
    "us.icr.io/",
    "icr.io/",
    "registry.ng.bluemix.net/",
)

SEVERITY_RANK = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "UNKNOWN": 4}

# ── in-memory cache ───────────────────────────────────────────────────────────
_cache: Dict[str, Tuple[float, Dict]] = {}   # image → (timestamp, result)
_scan_lock = asyncio.Semaphore(MAX_CONCURRENT)


def _clean_docker_config() -> str:
    """
    Write a minimal Docker config that has NO credsStore entry so that
    trivy does not try to exec docker-credential-desktop (which doesn't
    exist on this machine when Docker Desktop is not running).
    Returns the path to the temp directory.
    """
    tmpdir = tempfile.mkdtemp(prefix="trivy-dcfg-")
    cfg_path = Path(tmpdir) / "config.json"
    cfg_path.write_text('{"auths": {}}')
    return tmpdir


def _trivy_binary() -> Optional[str]:
    """Find trivy on PATH or common install locations."""
    for candidate in ["/usr/local/bin/trivy", "/opt/homebrew/bin/trivy", "/usr/bin/trivy"]:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return shutil.which("trivy")


def _is_skippable(image: str) -> bool:
    return any(image.startswith(p) for p in _SKIP_PREFIXES)


def _parse_trivy_json(raw: dict, image: str) -> Dict[str, Any]:
    """
    Convert the trivy JSON output into a flat dict suitable for the API response.
    """
    all_vulns: List[Dict] = []
    for result in raw.get("Results") or []:
        target = result.get("Target", "")
        pkg_type = result.get("Type", "")
        for v in result.get("Vulnerabilities") or []:
            cvss_score = 0.0
            cvss_vec = ""
            cvss_block = v.get("CVSS") or {}
            for source in ("nvd", "redhat", "ghsa"):
                entry = cvss_block.get(source) or {}
                score = entry.get("V3Score") or entry.get("V2Score") or 0.0
                if score > cvss_score:
                    cvss_score = score
                    cvss_vec = entry.get("V3Vector") or entry.get("V2Vector") or ""

            all_vulns.append({
                "vuln_id":           v.get("VulnerabilityID", ""),
                "pkg_name":          v.get("PkgName", ""),
                "installed_version": v.get("InstalledVersion", ""),
                "fixed_version":     v.get("FixedVersion") or "",
                "severity":          v.get("Severity", "UNKNOWN"),
                "title":             v.get("Title") or v.get("Description", "")[:120],
                "description":       (v.get("Description") or "")[:300],
                "cvss_score":        round(cvss_score, 1),
                "cvss_vector":       cvss_vec,
                "primary_url":       v.get("PrimaryURL") or f"https://avd.aquasec.com/nvd/{v.get('VulnerabilityID','')}",
                "target":            target,
                "pkg_type":          pkg_type,
                "has_fix":           bool(v.get("FixedVersion")),
            })

    # Sort: critical first, then by cvss desc
    all_vulns.sort(key=lambda x: (
        SEVERITY_RANK.get(x["severity"], 9),
        -x["cvss_score"]
    ))

    counts = {s: 0 for s in SEVERITY_RANK}
    for v in all_vulns:
        sev = v["severity"]
        if sev in counts:
            counts[sev] += 1

    patchable = sum(1 for v in all_vulns if v["has_fix"])

    # Parse image name / tag / registry
    image_ref = image
    tag = "latest"
    if "@sha256:" in image_ref:
        image_ref, digest = image_ref.split("@", 1)
        tag = "@" + digest[:12]
    elif ":" in image_ref.split("/")[-1]:
        image_ref, tag = image_ref.rsplit(":", 1)

    registry = "docker.io"
    parts = image_ref.split("/")
    if len(parts) >= 2 and ("." in parts[0] or ":" in parts[0]):
        registry = parts[0]

    # Derive risk level
    if counts["CRITICAL"] > 0:
        risk_level = "critical"
    elif counts["HIGH"] > 0:
        risk_level = "high"
    elif counts["MEDIUM"] > 0:
        risk_level = "medium"
    elif counts["LOW"] > 0:
        risk_level = "low"
    else:
        risk_level = "clean"

    # Detect base image hint from OS info
    os_info = (raw.get("Metadata") or {}).get("OS") or {}
    base_image = None
    os_family = (os_info.get("Family") or "").lower()
    if os_family:
        base_image = os_family
    elif "alpine" in image.lower():
        base_image = "alpine"
    elif "ubuntu" in image.lower():
        base_image = "ubuntu"
    elif "debian" in image.lower():
        base_image = "debian"

    return {
        "image":             image,
        "name":              image,
        "image_name":        image_ref,
        "image_tag":         tag,
        "registry":          registry,
        "base_image":        base_image,
        "risk_level":        risk_level,
        "scan_status":       "scanned",
        "total_vulnerabilities": len(all_vulns),
        "critical":          counts["CRITICAL"],
        "high":              counts["HIGH"],
        "medium":            counts["MEDIUM"],
        "low":               counts["LOW"],
        "patchable":         patchable,
        "vulnerabilities":   all_vulns[:200],   # cap at 200 per image in the response
        "scanned_at":        time.time(),
        "trivy_schema":      raw.get("SchemaVersion"),
    }


async def scan_image(image: str) -> Dict[str, Any]:
    """
    Scan a single image with trivy. Returns cached result if fresh.
    Raises RuntimeError on failure so callers can record scan_status=error.
    """
    now = time.time()

    # Return from cache if still fresh
    cached = _cache.get(image)
    if cached and (now - cached[0]) < CACHE_TTL:
        logger.debug(f"trivy cache hit: {image}")
        return cached[1]

    if _is_skippable(image):
        result = {
            "image": image, "name": image,
            "image_name": image, "image_tag": "", "registry": image.split("/")[0],
            "base_image": None, "risk_level": "unknown",
            "scan_status": "skipped",
            "total_vulnerabilities": 0,
            "critical": 0, "high": 0, "medium": 0, "low": 0, "patchable": 0,
            "vulnerabilities": [],
            "scanned_at": now, "skip_reason": "Private / air-gapped registry",
        }
        _cache[image] = (now, result)
        return result

    trivy = _trivy_binary()
    if not trivy:
        raise RuntimeError("trivy binary not found on PATH")

    docker_cfg_dir = _clean_docker_config()
    cmd = [
        trivy, "image",
        "--no-progress",
        "--format", "json",
        "--timeout", f"{SCAN_TIMEOUT}s",
        "--db-repository", DB_REPOSITORY,
        image,
    ]
    env = dict(os.environ)
    env["DOCKER_CONFIG"] = docker_cfg_dir

    logger.info(f"trivy scan starting: {image}")
    async with _scan_lock:
        loop = asyncio.get_event_loop()
        try:
            proc_result = await loop.run_in_executor(
                None,
                lambda: subprocess.run(
                    cmd, capture_output=True, timeout=SCAN_TIMEOUT + 10, env=env
                )
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"Trivy scan timed out after {SCAN_TIMEOUT}s for {image}")
        finally:
            # Clean up temp dir
            try:
                import shutil as _sh; _sh.rmtree(docker_cfg_dir, ignore_errors=True)
            except Exception:
                pass

    stderr_text = proc_result.stderr.decode("utf-8", errors="replace")

    if proc_result.returncode not in (0, 1):   # 1 = vulns found, still valid JSON
        raise RuntimeError(
            f"trivy exited {proc_result.returncode} for {image}: {stderr_text[:300]}"
        )

    raw_output = proc_result.stdout.decode("utf-8", errors="replace").strip()
    if not raw_output:
        raise RuntimeError(f"trivy produced no output for {image}. stderr: {stderr_text[:200]}")

    try:
        raw = json.loads(raw_output)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"trivy JSON parse error for {image}: {e}")

    result = _parse_trivy_json(raw, image)
    _cache[image] = (time.time(), result)
    logger.info(
        f"trivy scan done: {image}  "
        f"C={result['critical']} H={result['high']} M={result['medium']} L={result['low']}"
    )
    return result


async def scan_images_batch(images: List[str]) -> List[Dict[str, Any]]:
    """
    Scan a list of images concurrently (bounded by MAX_CONCURRENT semaphore).
    Returns one result dict per image — never raises; errors become scan_status=error entries.
    """
    async def _safe(img: str) -> Dict[str, Any]:
        try:
            return await scan_image(img)
        except Exception as exc:
            logger.warning(f"trivy scan failed for {img}: {exc}")
            return {
                "image": img, "name": img,
                "image_name": img, "image_tag": "", "registry": "",
                "base_image": None, "risk_level": "unknown",
                "scan_status": "error",
                "error_message": str(exc)[:200],
                "total_vulnerabilities": 0,
                "critical": 0, "high": 0, "medium": 0, "low": 0, "patchable": 0,
                "vulnerabilities": [],
                "scanned_at": time.time(),
            }

    tasks = [_safe(img) for img in images]
    return list(await asyncio.gather(*tasks))


def cache_stats() -> Dict[str, Any]:
    now = time.time()
    fresh = sum(1 for ts, _ in _cache.values() if now - ts < CACHE_TTL)
    return {
        "total_cached": len(_cache),
        "fresh_entries": fresh,
        "cache_ttl_seconds": CACHE_TTL,
    }
