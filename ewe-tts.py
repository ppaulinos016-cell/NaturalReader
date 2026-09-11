import sys
import os
import torch
import soundfile as sf
from transformers import VitsModel, AutoTokenizer

MODEL_NAME = "facebook/mms-tts-ewe"

if len(sys.argv) < 3:
    raise SystemExit("Usage: ewe-tts.py <texte> <fichier-sortie.wav>")

text = sys.argv[1]
output_path = sys.argv[2]

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = VitsModel.from_pretrained(MODEL_NAME)

inputs = tokenizer(text, return_tensors="pt")

with torch.no_grad():
    waveform = model(**inputs).waveform

audio = waveform.squeeze().cpu().numpy()

os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
sf.write(output_path, audio, model.config.sampling_rate)

print(output_path)
