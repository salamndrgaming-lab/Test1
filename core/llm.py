"""
LLM wrapper around Groq's free API.

Groq exposes an OpenAI-compatible endpoint, so we use the `openai` library
but point it at Groq's servers. Get a FREE key at https://console.groq.com
and set it as the GROQ_API_KEY environment variable.

No paid API key is required anywhere in this project.
"""

import os
import sys

from openai import OpenAI

# A strong, free model on Groq. Change here if you ever want a different one.
DEFAULT_MODEL = "llama-3.3-70b-versatile"

_client = None


def _get_client():
    """Create the Groq client once and reuse it."""
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            print(
                "\n[!] No GROQ_API_KEY found.\n"
                "    Get a FREE key at https://console.groq.com (no credit card),\n"
                "    then set it:\n"
                "      Mac/Linux:  export GROQ_API_KEY=your_key_here\n"
                "      Windows:    set GROQ_API_KEY=your_key_here\n"
            )
            sys.exit(1)
        _client = OpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        )
    return _client


def ask(system_prompt, user_message, model=DEFAULT_MODEL, temperature=0.7):
    """
    Send one message to the model and return its text reply.

    This is the single place every agent goes through to think.
    """
    client = _get_client()
    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )
    return response.choices[0].message.content.strip()
