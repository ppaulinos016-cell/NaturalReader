require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const crypto = require("crypto");
const { EdgeTTS } = require("node-edge-tts");
const { registerExpressiveTTS } = require("./expressive-engine");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/voices", async (req, res) => {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "Clé API ElevenLabs absente du serveur."
            });
        }

        const response = await fetch("https://api.elevenlabs.io/v1/voices", {
            method: "GET",
            headers: {
                "xi-api-key": apiKey
            }
        });

        if (!response.ok) {
            const errorText = await response.text();

            console.error("Erreur ElevenLabs :", errorText);

            return res.status(response.status).json({
                error: "Impossible de récupérer les voix ElevenLabs.",
                details: errorText
            });
        }

        const data = await response.json();

        res.json(data);

    } catch (error) {
        console.error("Erreur récupération des voix :", error);

        res.status(500).json({
            error: "Erreur interne lors de la récupération des voix."
        });
    }
});

app.post("/api/tts", async (req, res) => {
    try {
        const { text, voiceId, languageCode = "fr" } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                error: "Le texte est vide."
            });
        }

        if (!voiceId) {
            return res.status(400).json({
                error: "Aucune voix n'a été sélectionnée."
            });
        }

        const apiKey = process.env.ELEVENLABS_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "Clé API ElevenLabs absente du serveur."
            });
        }

        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "xi-api-key": apiKey
                },
                body: JSON.stringify({
                    text: text.trim(),
                    model_id: "eleven_multilingual_v2",
                    language_code: languageCode,
                    output_format: "mp3_44100_128"
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();

            console.error("Erreur ElevenLabs :", errorText);

            return res.status(response.status).json({
                error: "Erreur ElevenLabs.",
                details: errorText
            });
        }

        const audioBuffer = Buffer.from(await response.arrayBuffer());

        res.set({
            "Content-Type": "audio/mpeg",
            "Content-Length": audioBuffer.length,
            "Cache-Control": "no-cache"
        });

        res.send(audioBuffer);

    } catch (error) {
        console.error("Erreur serveur TTS :", error);

        res.status(500).json({
            error: "Erreur interne lors de la génération audio."
        });
    }
});

/*
 * GÉNÉRATION AUDIO MICROSOFT
 * Texte + voix Microsoft + vitesse -> MP3
 */

const MICROSOFT_VOICES = {
    "Microsoft Denise Online (Natural)": "fr-FR-DeniseNeural",
    "Microsoft Eloise Online (Natural)": "fr-FR-EloiseNeural",
    "Microsoft Jean Online (Natural)": "fr-CA-JeanNeural",
    "Microsoft Maisie Online (Natural)": "en-GB-MaisieNeural",
    "Microsoft Ezinne Online (Natural)": "en-NG-EzinneNeural",
    "Microsoft Seraphina Mehrsprachig Online (Natural)": "de-DE-SeraphinaMultilingualNeural",
    "Microsoft Conrad Online (Natural)": "de-DE-ConradNeural"
};

function findMicrosoftVoice(voiceName) {
    if (!voiceName) return null;

    const entry = Object.entries(MICROSOFT_VOICES).find(([displayName]) =>
        voiceName.toLowerCase().includes(displayName.toLowerCase())
    );

    return entry ? entry[1] : null;
}

function convertSpeedToRate(speed) {
    const value = Number(speed);

    if (!Number.isFinite(value)) {
        return "+0%";
    }

    const percent = Math.round((value - 1) * 100);

    return `${percent >= 0 ? "+" : ""}${percent}%`;
}

app.post("/api/tts-microsoft", async (req, res) => {
    let outputPath = null;

    try {
        const {
            text,
            voiceName,
            speed = 1
        } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                error: "Le texte est vide."
            });
        }

        if (!voiceName) {
            return res.status(400).json({
                error: "Aucune voix Microsoft n'a été sélectionnée."
            });
        }

        const microsoftVoice = findMicrosoftVoice(voiceName);

        if (!microsoftVoice) {
            return res.status(400).json({
                error: "Cette voix Microsoft n'est pas autorisée."
            });
        }

        const rate = convertSpeedToRate(speed);

        const filename =
            `naturalreader-${crypto.randomUUID()}.mp3`;

        outputPath = path.join(os.tmpdir(), filename);

        const tts = new EdgeTTS({
            voice: microsoftVoice,
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
            rate,
            pitch: "default",
            volume: "default"
        });

        await tts.ttsPromise(text.trim(), outputPath);

        const audioBuffer = await fs.readFile(outputPath);

        res.set({
            "Content-Type": "audio/mpeg",
            "Content-Length": audioBuffer.length,
            "Content-Disposition": 'attachment; filename="NaturalReader-audio.mp3"',
            "Cache-Control": "no-cache"
        });

        res.send(audioBuffer);

    } catch (error) {
        console.error("Erreur génération Microsoft TTS :", error);

        if (!res.headersSent) {
            res.status(500).json({
                error: "Impossible de générer le fichier audio Microsoft.",
                details: error.message
            });
        }

    } finally {
        if (outputPath) {
            try {
                await fs.unlink(outputPath);
            } catch {
                // Le fichier temporaire peut déjà avoir été supprimé.
            }
        }
    }
});

registerExpressiveTTS(app, { findMicrosoftVoice, convertSpeedToRate });

app.listen(PORT, () => {
    console.log(`NaturalReader lancé sur le port ${PORT}`);
});
