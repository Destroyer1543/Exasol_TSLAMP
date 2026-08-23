"""
Gemini API client — wraps google-generativeai SDK
"""

import os
import base64
from typing import Optional
import google.generativeai as genai

_model: Optional[genai.GenerativeModel] = None
_vision_model: Optional[genai.GenerativeModel] = None


def _get_model() -> genai.GenerativeModel:
    global _model
    if _model is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY environment variable not set")
        genai.configure(api_key=api_key)
        _model = genai.GenerativeModel("gemini-2.0-flash")
    return _model


async def generate_text(prompt: str, system_instruction: Optional[str] = None) -> str:
    """Generate text from a prompt using Gemini Flash."""
    model = _get_model()
    try:
        if system_instruction:
            # Prepend system instruction as context
            full_prompt = f"{system_instruction}\n\n---\n\n{prompt}"
        else:
            full_prompt = prompt
        response = model.generate_content(full_prompt)
        return response.text
    except Exception as e:
        return f"[Gemini error: {e}]"


async def analyze_damage_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """Send an image to Gemini Vision for damage assessment."""
    model = _get_model()
    prompt = (
        "You are a crisis damage assessment AI. Analyze this disaster image and return a structured JSON assessment with:\n"
        "- damage_level: one of [none, minor, moderate, severe, catastrophic]\n"
        "- damage_type: list of types observed [flooding, structural_collapse, fire, debris, etc.]\n"
        "- casualties_visible: boolean\n"
        "- infrastructure_damaged: list of infrastructure types\n"
        "- immediate_hazards: list of immediate hazards\n"
        "- recommended_response: brief recommended action\n"
        "- confidence: 0.0-1.0\n\n"
        "Respond with ONLY valid JSON."
    )
    try:
        image_part = {"mime_type": mime_type, "data": base64.b64encode(image_bytes).decode()}
        response = model.generate_content([prompt, image_part])
        import json
        text = response.text.strip().lstrip("```json").rstrip("```").strip()
        return json.loads(text)
    except Exception as e:
        return {"error": str(e), "damage_level": "unknown", "confidence": 0.0}
