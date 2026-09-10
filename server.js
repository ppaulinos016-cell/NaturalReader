require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const crypto = require("crypto");
const { EdgeTTS } = require("node-edge-tts");
const { registerExpressiveTTS } = require("./expressive-engine");
const { registerVideoEngine } = require("./video-engine");
const { buildReel } = require("./video/reel-engine");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/voices", async (req, res) => {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "ClÃ© API ElevenLabs absente du serveur."
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
                error: "Impossible de rÃ©cupÃ©rer les voix ElevenLabs.",
                details: errorText
            });
        }

        const data = await response.json();

        res.json(data);

    } catch (error) {
        console.error("Erreur rÃ©cupÃ©ration des voix :", error);

        res.status(500).json({
            error: "Erreur interne lors de la rÃ©cupÃ©ration des voix."
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
                error: "Aucune voix n'a Ã©tÃ© sÃ©lectionnÃ©e."
            });
        }

        const apiKey = process.env.ELEVENLABS_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "ClÃ© API ElevenLabs absente du serveur."
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
            error: "Erreur interne lors de la gÃ©nÃ©ration audio."
        });
    }
});

/*
 * GÃ‰NÃ‰RATION AUDIO MICROSOFT
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
                error: "Aucune voix Microsoft n'a Ã©tÃ© sÃ©lectionnÃ©e."
            });
        }

        const microsoftVoice = findMicrosoftVoice(voiceName);

        if (!microsoftVoice) {
            return res.status(400).json({
                error: "Cette voix Microsoft n'est pas autorisÃ©e."
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
        console.error("Erreur gÃ©nÃ©ration Microsoft TTS :", error);

        if (!res.headersSent) {
            res.status(500).json({
                error: "Impossible de gÃ©nÃ©rer le fichier audio Microsoft.",
                details: error.message
            });
        }

    } finally {
        if (outputPath) {
            try {
                await fs.unlink(outputPath);
            } catch {
                // Le fichier temporaire peut dÃ©jÃ  avoir Ã©tÃ© supprimÃ©.
            }
        }
    }
});

registerExpressiveTTS(app, { findMicrosoftVoice, convertSpeedToRate });
registerVideoEngine(app);


app.post("/api/generate-reel", async (req, res) => {
    try {
        const {
            text,
            voiceName,
            speed = 1,
            mode = "intelligent",
            language = "fr-FR"
        } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                error: "Le texte est vide."
            });
        }

        if (!voiceName) {
            return res.status(400).json({
                error: "Aucune voix Microsoft n'a Ã©tÃ© sÃ©lectionnÃ©e."
            });
        }

        console.log(
            `NaturalReader Reel : ${language} / ${voiceName} / ${mode}`
        );

        const result = await buildReel({
            text: text.trim(),
            voiceName,
            speed,
            mode
        });

        const videoBuffer =
            await fs.readFile(
                result.outputPath
            );

        res.set({
            "Content-Type": "video/mp4",
            "Content-Length": videoBuffer.length,
            "Content-Disposition":
                'attachment; filename="NaturalReader-Reel.mp4"',
            "Cache-Control": "no-cache",
            "X-NaturalReader-Scenes":
                String(result.sceneCount),
            "X-NaturalReader-Voice":
                voiceName,
            "X-NaturalReader-Mode":
                mode,
        });

        res.send(videoBuffer);

    } catch (error) {
        console.error(
            "Erreur NaturalReader Reel :",
            error
        );

        if (!res.headersSent) {
            res.status(500).json({
                error:
                    "Impossible de gÃ©nÃ©rer le Reel.",
                details:
                    error.message
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`NaturalReader lancÃ© sur le port ${PORT}`);
});

