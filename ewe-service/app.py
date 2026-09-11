import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from transformers import VitsModel, AutoTokenizer
import torch
import soundfile as sf
import io

MODEL_NAME = "facebook/mms-tts-ewe"

app = FastAPI(title="NaturalReader Ewe TTS", version="1.0.0")

PORT = int(os.environ.get("PORT", "8001"))

print(f"Chargement du modèle {MODEL_NAME}...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = VitsModel.from_pretrained(MODEL_NAME)
model.eval()
print("✅ Modèle Éwé chargé")

class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "language": "ee",
        "model": MODEL_NAME
    }

@app.post("/tts")
def tts(request: TTSRequest):
    text = request.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Texte vide")

    try:
        inputs = tokenizer(text, return_tensors="pt")

        with torch.no_grad():
            waveform = model(**inputs).waveform

        audio = waveform.squeeze().cpu().numpy()

        buffer = io.BytesIO()
        sf.write(
            buffer,
            audio,
            model.config.sampling_rate,
            format="WAV"
        )

        return Response(
            content=buffer.getvalue(),
            media_type="audio/wav",
            headers={
                "Content-Disposition":
                    'inline; filename="naturalreader-ewe.wav"'
            }
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc)
        ) from exc


