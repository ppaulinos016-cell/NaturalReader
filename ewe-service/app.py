import os
import re
import io
import gc
import threading

import numpy as np
import torch
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from transformers import VitsModel, AutoTokenizer

MODEL_NAME = "facebook/mms-tts-ewe"
PORT = int(os.environ.get("PORT", "8001"))
MAX_CHUNK_CHARS = 1600

app = FastAPI(title="NaturalReader Ewe TTS", version="1.1.0")

print(f"Chargement du modèle {MODEL_NAME}...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = VitsModel.from_pretrained(MODEL_NAME)
model.eval()
print("✅ Modèle Éwé chargé")

INFERENCE_LOCK = threading.Lock()


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=50000)


def split_long_text(text: str, max_chars: int = MAX_CHUNK_CHARS):
    text = re.sub(r"\s+", " ", text.strip())

    if len(text) <= max_chars:
        return [text]

    sentences = re.split(r"(?<=[.!?…])\s+", text)
    chunks = []
    current = ""

    for sentence in sentences:
        sentence = sentence.strip()

        if not sentence:
            continue

        if len(sentence) > max_chars:
            words = sentence.split()

            for word in words:
                candidate = f"{current} {word}".strip()

                if len(candidate) <= max_chars:
                    current = candidate
                else:
                    if current:
                        chunks.append(current)
                    current = word

            continue

        candidate = f"{current} {sentence}".strip()

        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = sentence

    if current:
        chunks.append(current)

    return chunks or [text]


def synthesize_chunk(text: str):
    inputs = tokenizer(text, return_tensors="pt")

    with torch.no_grad():
        waveform = model(**inputs).waveform

    return waveform.squeeze().cpu().numpy()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "language": "ee",
        "model": MODEL_NAME,
        "chunking": True,
        "max_chunk_chars": MAX_CHUNK_CHARS,
    }


@app.post("/tts")
def tts(request: TTSRequest):
    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Texte vide"
        )

    chunks = split_long_text(text)

    print(
        f"TTS Éwé : {len(chunks)} bloc(s), "
        f"{len(text)} caractères"
    )

    try:
        with INFERENCE_LOCK:
            parts = [
                synthesize_chunk(chunk)
                for chunk in chunks
            ]

        audio = (
            parts[0]
            if len(parts) == 1
            else np.concatenate(parts)
        )

        buffer = io.BytesIO()

        sf.write(
            buffer,
            audio,
            model.config.sampling_rate,
            format="WAV"
        )

        gc.collect()

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        return Response(
            content=buffer.getvalue(),
            media_type="audio/wav",
            headers={
                "Content-Disposition":
                    'inline; filename="naturalreader-ewe.wav"',
                "X-NaturalReader-Ewe-Chunks":
                    str(len(chunks)),
            },
        )

    except Exception as exc:
        gc.collect()

        raise HTTPException(
            status_code=500,
            detail=str(exc)
        ) from exc
