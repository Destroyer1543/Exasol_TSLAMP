"""
Text LLM client (Groq, via backend.ai.llm). Kept for API compatibility.
"""

import asyncio
from typing import Optional

from .llm import get_model as _get_model


async def generate_text(prompt: str, system_instruction: Optional[str] = None) -> str:
    """Generate text from a prompt using the active LLM (Groq)."""
    try:
        full_prompt = f"{system_instruction}\n\n---\n\n{prompt}" if system_instruction else prompt
        model = _get_model()
        response = await asyncio.to_thread(model.generate_content, full_prompt)
        return response.text
    except Exception as e:
        return f"[LLM error: {e}]"
