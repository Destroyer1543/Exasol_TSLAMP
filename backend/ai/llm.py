"""LLM backend for ARIA — Groq (free tier), OpenAI-compatible chat API.

Exposes a tiny shim whose object mirrors the google-generativeai surface the
rest of the codebase already uses: `get_model().generate_content(prompt).text`.
That keeps every existing call site unchanged while swapping the provider.

Config (env):
  GROQ_API_KEY   required
  LLM_MODEL      optional, default llama-3.3-70b-versatile
"""

from __future__ import annotations

import os
import time
import httpx

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_DEFAULT_MODEL = "openai/gpt-oss-120b"

# Prompts in this app ask for JSON with these phrasings. When present we turn on
# Groq JSON mode for more reliable structured output (the word "json" is already
# in the prompt, which Groq requires for json_object mode).
_JSON_HINTS = ("valid json", "only the json", "return only the json")


class _Response:
    def __init__(self, text: str):
        self.text = text


class _Model:
    def __init__(self, model: str):
        self._model = model

    def generate_content(self, prompt: str, **_ignored) -> _Response:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not set")

        body = {
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4,
            "max_tokens": 5000,
        }
        # gpt-oss spends hidden "reasoning" tokens from the same budget; keep it
        # low so the JSON completes within the free-tier 8k TPM ceiling.
        if self._model.startswith("openai/gpt-oss"):
            body["reasoning_effort"] = "low"
        if any(h in prompt.lower() for h in _JSON_HINTS):
            body["response_format"] = {"type": "json_object"}

        headers = {"Authorization": f"Bearer {api_key}"}
        # Free-tier rate limits (429) and transient 5xx: retry with backoff,
        # honoring Retry-After when Groq provides it.
        last = ""
        for attempt in range(4):
            resp = httpx.post(_GROQ_URL, headers=headers, json=body, timeout=180.0)
            if resp.status_code < 400:
                return _Response(resp.json()["choices"][0]["message"]["content"])
            last = f"Groq {resp.status_code}: {resp.text[:300]}"
            if resp.status_code in (429, 500, 502, 503) and attempt < 3:
                wait = float(resp.headers.get("retry-after", 0)) or (2 ** attempt) * 3
                time.sleep(min(wait, 30))
                continue
            break
        raise RuntimeError(last)


def get_model() -> _Model:
    return _Model(os.environ.get("LLM_MODEL", _DEFAULT_MODEL))
