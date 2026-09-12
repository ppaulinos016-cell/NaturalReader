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

PUNCTUATION_PAUSES_MS = {
    ",": 250,
    ";": 400,
    ":": 350,
    ".": 1200,
    "?": 1200,
    "!": 1200,
}

app = FastAPI(
    title="NaturalReader Ewe TTS",
    version="1.1.0"
)

print(f"Chargement du modèle {MODEL_NAME}...")

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = VitsModel.from_pretrained(MODEL_NAME)
model.eval()

print("✅ Modèle Éwé chargé")

INFERENCE_LOCK = threading.Lock()


class TTSRequest(BaseModel):
    text: str = Field(
        min_length=1,
        max_length=50000
    )



EWE_UNITS = {
    0: "nadeke",
    1: "\u0256eka",
    2: "eve",
    3: "et\u0254\u0303",
    4: "ene",
    5: "at\u0254\u0303",
    6: "ade",
    7: "adr\u025b",
    8: "enyi",
    9: "asieke",
}

def ewe_number_under_100(n: int) -> str:
    if n < 10:
        return EWE_UNITS[n]

    if n == 10:
        return "ewo"

    if n < 20:
        return "wui" + EWE_UNITS[n - 10]

    tens, units = divmod(n, 10)

    tens_words = {
        2: "blaeve",
        3: "blaet\u0254\u0303",
        4: "blaene",
        5: "blaat\u0254\u0303",
        6: "blaade",
        7: "blaadre",
        8: "blaenyi",
        9: "blaasieke",
    }

    result = tens_words[tens]

    if units:
        result += " v\u0254 " + EWE_UNITS[units]

    return result


def ewe_number_to_words(n: int) -> str:
    if n < 100:
        return ewe_number_under_100(n)

    if n < 1000:
        hundreds, remainder = divmod(n, 100)
        result = "alafa " + EWE_UNITS[hundreds]

        if remainder:
            result += " kple " + ewe_number_under_100(remainder)

        return result

    if n < 1000000:
        thousands, remainder = divmod(n, 1000)
        result = "akpe"

        if thousands != 1:
            result += " " + ewe_number_to_words(thousands)
        else:
            result += " \u0256eka"

        if remainder:
            if remainder < 100:
                result += " kple " + ewe_number_under_100(remainder)
            else:
                result += " kple " + ewe_number_to_words(remainder)

        return result

    return str(n)


def convert_numbers_to_ewe(text: str) -> str:
    def replace_number(match):
        value = int(match.group(0).replace(",", "").replace(" ", ""))
        return ewe_number_to_words(value)

    return re.sub(r"(?<![\w])\d[\d, ]*\d|\b\d+\b", replace_number, text)

def split_long_text(
    text: str,
    max_chars: int = MAX_CHUNK_CHARS
):
    text = re.sub(r"\s+", " ", text.strip())

    if not text:
        return []

    chunks = []
    current_words = []
    current_length = 0

    def flush(pause_ms=0):
        nonlocal current_words, current_length

        if current_words:
            chunks.append((
                " ".join(current_words),
                pause_ms
            ))

        current_words = []
        current_length = 0

    for raw_word in text.split():
        word = raw_word

        punctuation = ""
        match = re.search(
            r"([,;:.!??]+)$",
            word
        )

        if match:
            punctuation = match.group(1)
            word = word[:match.start()]

        if word:
            candidate_length = (
                current_length +
                (1 if current_words else 0) +
                len(word)
            )

            if (
                current_words
                and candidate_length > max_chars
            ):
                flush(0)

            current_words.append(word)
            current_length = (
                current_length +
                (1 if len(current_words) > 1 else 0) +
                len(word)
            )

        if punctuation:
            pause_ms = max(
                PUNCTUATION_PAUSES_MS.get(
                    mark,
                    0
                )
                for mark in punctuation
            )

            flush(pause_ms)

    flush(0)

    return chunks or [(text, 0)]

def synthesize_chunk(text: str):
    inputs = tokenizer(
        text,
        return_tensors="pt"
    )

    with torch.no_grad():
        waveform = model(
            **inputs
        ).waveform

    return waveform.squeeze().cpu().numpy()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "language": "ee",
        "model": MODEL_NAME,
        "chunking": True,
        "max_chunk_chars":
            MAX_CHUNK_CHARS
    }


@app.post("/tts")
def tts(request: TTSRequest):
    text = convert_numbers_to_ewe(request.text.strip())

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
        parts = []

        with INFERENCE_LOCK:
            for chunk_text, pause_ms in chunks:
                parts.append(
                    synthesize_chunk(chunk_text)
                )

                if pause_ms > 0:
                    pause_samples = int(
                        model.config.sampling_rate
                        * pause_ms
                        / 1000
                    )

                    parts.append(
                        np.zeros(
                            pause_samples,
                            dtype=np.float32
                        )
                    )

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
                    str(len(chunks))
            }
        )

    except Exception as exc:
        gc.collect()

        raise HTTPException(
            status_code=500,
            detail=str(exc)
        ) from exc

