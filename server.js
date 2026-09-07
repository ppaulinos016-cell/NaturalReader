require("dotenv").config();

const express = require("express");
const path = require("path");

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

app.listen(PORT, () => {
    console.log(`NaturalReader lancé sur le port ${PORT}`);
});
