"""
OpenAI async client with global timeout.
Import `openai_chat()` anywhere in the backend to make a timed AI call.
"""
import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Global timeout for all OpenAI calls (seconds)
OPENAI_TIMEOUT = int(os.environ.get("OPENAI_TIMEOUT", "30"))


async def openai_chat(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    max_tokens: int = 1000,
    timeout: int = OPENAI_TIMEOUT,
) -> Optional[str]:
    """
    Make an OpenAI chat completion call with a hard timeout.
    Returns the response text or None on failure/timeout.

    Usage:
        from utils.ai_client import openai_chat
        reply = await openai_chat([{"role": "user", "content": "Summarise this cluster"}])
    """
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set — skipping AI call")
        return None

    _model = model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    try:
        import httpx

        payload = {
            "model": _model,
            "messages": messages,
            "max_tokens": max_tokens,
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    except asyncio.TimeoutError:
        logger.error(f"OpenAI call timed out after {timeout}s")
        return None
    except Exception as e:
        logger.error(f"OpenAI call failed: {e}")
        return None

# Made with Bob
