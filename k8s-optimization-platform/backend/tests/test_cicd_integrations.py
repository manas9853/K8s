"""
Self-check for api/cicd_integrations.py's response parsing — real-shaped
synthetic API responses for GitHub Actions, GitLab CI, and Jenkins, no
live accounts or network calls needed. Verifies the shape matches exactly
what each frontend page's TS interface expects (a real Phase 1 bug class:
shape mismatches between agent/backend snake_case and frontend camelCase).
"""
import os
import sys
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "postgresql://fake:fake@localhost:5432/testdb")

from api import cicd_integrations as ci  # noqa: E402


class _FakeResponse:
    def __init__(self, status_code, json_data):
        self.status_code = status_code
        self._json = json_data
        self.text = str(json_data)

    def json(self):
        return self._json


@pytest.mark.asyncio
async def test_github_actions_shape():
    runs_payload = {"workflow_runs": [{
        "name": "CI", "head_branch": "main", "status": "completed",
        "conclusion": "success", "run_started_at": "2026-08-21T10:00:00Z",
        "updated_at": "2026-08-21T10:05:30Z",
    }]}

    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=_FakeResponse(200, runs_payload))):
        out = await ci._sync_github_actions("fake-token", "acme/widgets")

    assert out == [{
        "workflow": "CI", "repo": "acme/widgets", "branch": "main",
        "status": "completed", "conclusion": "success",
        "duration": "5m30s", "triggeredAt": "2026-08-21T10:00:00Z",
    }]


@pytest.mark.asyncio
async def test_gitlab_ci_shape():
    list_payload = [{"id": 42, "ref": "main", "status": "success", "created_at": "2026-08-21T10:00:00Z"}]
    detail_payload = {
        "id": 42, "ref": "main", "status": "success", "created_at": "2026-08-21T10:00:00Z",
        "duration": 90, "user": {"name": "Jane Doe"},
    }

    calls = {"n": 0}

    async def fake_get(self, url, **kwargs):
        calls["n"] += 1
        if url.endswith("/pipelines"):
            return _FakeResponse(200, list_payload)
        return _FakeResponse(200, detail_payload)

    with patch("httpx.AsyncClient.get", new=fake_get):
        out = await ci._sync_gitlab_ci("fake-token", "group/project", None)

    assert out == [{
        "project": "group/project", "branch": "main", "stage": "success",
        "status": "success", "duration": "90s",
        "triggeredAt": "2026-08-21T10:00:00Z", "triggeredBy": "Jane Doe",
    }]


@pytest.mark.asyncio
async def test_jenkins_shape():
    jobs_payload = {"jobs": [{
        "name": "deploy-prod",
        "lastBuild": {
            "number": 17, "timestamp": 1755766800000, "duration": 45000,
            "result": "SUCCESS",
            "actions": [{"causes": [{"shortDescription": "Started by user Jane"}]}],
        },
    }]}

    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=_FakeResponse(200, jobs_payload))):
        out = await ci._sync_jenkins("fake-token", "jenkins-user", "http://jenkins.internal")

    assert out == [{
        "jobName": "deploy-prod", "lastBuild": "#17", "buildNumber": 17,
        "status": "SUCCESS", "duration": "45s",
        "triggeredBy": "Started by user Jane", "timestamp": "1755766800000",
    }]


@pytest.mark.asyncio
async def test_jenkins_still_running_has_no_result():
    jobs_payload = {"jobs": [{"name": "build", "lastBuild": {"number": 5, "timestamp": 1755766800000}}]}
    with patch("httpx.AsyncClient.get", new=AsyncMock(return_value=_FakeResponse(200, jobs_payload))):
        out = await ci._sync_jenkins("fake-token", "user", "http://jenkins.internal")
    assert out[0]["status"] == "RUNNING"


@pytest.mark.asyncio
async def test_sync_provider_dispatch_rejects_unknown():
    with pytest.raises(ValueError, match="Unsupported provider"):
        await ci._sync_provider("CircleCI", "enc", "ref", None, None)
