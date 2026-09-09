const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const ffmpegPath = require("ffmpeg-static");
const { EdgeTTS } = require("node-edge-tts");

const execFileAsync = promisify(execFile);

const EXPRESSION_PROFILES = {
    positive: {
        rateMin: 0.96,
        rateMax: 1.10,
        pitchMin: 1,
        pitchMax: 7
    },
    joyful: {
        rateMin: 0.98,
        rateMax: 1.18,
        pitchMin: 2,
        pitchMax: 11
    },
    sad: {
        rateMin: 0.80,
        rateMax: 0.96,
        pitchMin: -9,
        pitchMax: -1
    },
    calm: {
        rateMin: 0.82,
        rateMax: 0.98,
        pitchMin: -3,
        pitchMax: 3
    },
    poetic: {
        rateMin: 0.82,
        rateMax: 1.04,
        pitchMin: -2,
        pitchMax: 7
    },
    narrative: {
        rateMin: 0.92,
        rateMax: 1.09,
        pitchMin: -2,
        pitchMax: 6
    },
    dramatic: {
        rateMin: 0.80,
        rateMax: 1.18,
        pitchMin: -8,
        pitchMax: 11
    },
    energetic: {
        rateMin: 1.00,
        rateMax: 1.20,
        pitchMin: 2,
        pitchMax: 10
    },
    serious: {
        rateMin: 0.86,
        rateMax: 1.00,
        pitchMin: -5,
        pitchMax: 1
    },
    enthusiastic: {
        rateMin: 1.00,
        rateMax: 1.22,
        pitchMin: 4,
        pitchMax: 12
    },
    mysterious: {
        rateMin: 0.80,
        rateMax: 0.98,
        pitchMin: -7,
        pitchMax: 2
    },
    educational: {
        rateMin: 0.86,
        rateMax: 1.03,
        pitchMin: -2,
        pitchMax: 4
    },
    news: {
        rateMin: 0.94,
        rateMax: 1.08,
        pitchMin: -1,
        pitchMax: 4
    },
    story: {
        rateMin: 0.84,
        rateMax: 1.10,
        pitchMin: -3,
        pitchMax: 7
    },
    speech: {
        rateMin: 0.88,
        rateMax: 1.11,
        pitchMin: -2,
        pitchMax: 6
    }
};

const POSITIVE_WORDS = [
    "heureux", "heureuse", "joie", "joyeux", "joyeuse",
    "bonheur", "magnifique", "merveilleux", "merveilleuse",
    "beau", "belle", "bravo", "félicitations",
    "amour", "aime", "super", "excellent", "extraordinaire",
    "happy", "happiness", "joy", "joyful", "wonderful",
    "beautiful", "great", "excellent", "amazing",
    "congratulations", "love", "lovely",
    "glücklich", "freude", "wunderbar", "schön",
    "ausgezeichnet", "liebe"
];

const NEGATIVE_WORDS = [
    "triste", "tristesse", "peur", "douleur", "difficile",
    "problème", "échec", "regret", "déçu", "déception",
    "pain", "sad", "sadness", "fear", "difficult",
    "problem", "failure", "regret", "disappointed",
    "traurig", "traurigkeit", "angst", "schmerz",
    "schwierig", "problem", "fehler"
];

const IMPORTANT_WORDS = [
    "important", "attention", "souvenez", "n'oubliez",
    "remember", "important", "attention", "don't forget",
    "wichtig", "achtung", "vergessen sie nicht"
];

function countMatches(text, words) {
    const lower = text.toLowerCase();

    return words.reduce(
        (count, word) =>
            count + (lower.includes(word.toLowerCase()) ? 1 : 0),
        0
    );
}

function splitTextForExpression(text) {
    const normalized = text
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim();

    if (!normalized) {
        return [];
    }

    let parts = normalized
        .split(/(?<=[.!?…。！？])\s+/)
        .map(value => value.trim())
        .filter(Boolean);

    const result = [];

    for (const sentence of parts) {
        if (sentence.length <= 230) {
            result.push(sentence);
            continue;
        }

        const subParts = sentence
            .split(/(?<=[,;:])\s+/)
            .map(value => value.trim())
            .filter(Boolean);

        for (const part of subParts) {
            if (part.length <= 230) {
                result.push(part);
                continue;
            }

            const words = part.split(/\s+/);
            let current = "";

            for (const word of words) {
                const candidate =
                    current ? `${current} ${word}` : word;

                if (candidate.length > 180 && current) {
                    result.push(current.trim());
                    current = word;
                } else {
                    current = candidate;
                }
            }

            if (current.trim()) {
                result.push(current.trim());
            }
        }
    }

    return result;
}

function resolveIntelligentMode(text) {
    const positive = countMatches(text, POSITIVE_WORDS);
    const negative = countMatches(text, NEGATIVE_WORDS);
    const exclamations = (text.match(/!/g) || []).length;
    const questions = (text.match(/\?/g) || []).length;

    if (exclamations >= 2 || positive >= 2) {
        return "joyful";
    }

    if (negative >= 2) {
        return "sad";
    }

    if (questions >= 2) {
        return "educational";
    }

    return "narrative";
}

function analyzeSegment(text, mode, index, total) {
    const activeMode =
        mode === "intelligent"
            ? resolveIntelligentMode(text)
            : mode;

    const profile =
        EXPRESSION_PROFILES[activeMode] ||
        EXPRESSION_PROFILES.narrative;

    const positive = countMatches(text, POSITIVE_WORDS);
    const negative = countMatches(text, NEGATIVE_WORDS);
    const important = countMatches(text, IMPORTANT_WORDS);

    const exclamations =
        (text.match(/!/g) || []).length;

    const questions =
        (text.match(/\?/g) || []).length;

    const commas =
        (text.match(/,/g) || []).length;

    let intensity = 0.42;

    intensity += Math.min(positive * 0.08, 0.24);
    intensity -= Math.min(negative * 0.08, 0.24);
    intensity += Math.min(exclamations * 0.12, 0.24);
    intensity += Math.min(important * 0.10, 0.20);

    if (questions > 0) {
        intensity += 0.05;
    }

    if (text.length > 120) {
        intensity -= 0.03;
    }

    const position =
        total <= 1 ? 0.5 : index / (total - 1);

    if (
        activeMode === "dramatic" &&
        position > 0.25 &&
        position < 0.80
    ) {
        intensity += 0.12;
    }

    if (
        activeMode === "poetic" &&
        commas >= 1
    ) {
        intensity += 0.05;
    }

    intensity =
        Math.max(0, Math.min(1, intensity));

    let rateMultiplier =
        profile.rateMin +
        (profile.rateMax - profile.rateMin) * intensity;

    let pitch =
        profile.pitchMin +
        (profile.pitchMax - profile.pitchMin) * intensity;

    if (index === 0) {
        rateMultiplier *= 0.96;
    }

    if (index === total - 1 && total > 1) {
        rateMultiplier *= 0.94;
    }

    if (/[.!?…]$/.test(text)) {
        rateMultiplier *= 0.97;
    }

    let pauseAfterMs = 100;

    if (/[,;:]$/.test(text)) {
        pauseAfterMs = 180;
    }

    if (/[.!]$/.test(text)) {
        pauseAfterMs = 300;
    }

    if (/\?$/.test(text)) {
        pauseAfterMs = 340;
    }

    if (/!$/.test(text)) {
        pauseAfterMs = 380;
    }

    return {
        activeMode,
        intensity: Number(intensity.toFixed(2)),
        rateMultiplier: Number(rateMultiplier.toFixed(3)),
        pitch: `${pitch >= 0 ? "+" : ""}${Math.round(pitch)}Hz`,
        pauseAfterMs
    };
}

async function createSilence(outputPath, durationMs) {
    if (durationMs <= 0) {
        return;
    }

    const duration =
        Math.max(0.05, durationMs / 1000);

    await execFileAsync(
        ffmpegPath,
        [
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=mono:sample_rate=24000",
            "-t",
            String(duration),
            "-c:a",
            "libmp3lame",
            "-b:a",
            "48k",
            outputPath
        ],
        {
            windowsHide: true
        }
    );
}

async function registerExpressiveTTS(
    app,
    { findMicrosoftVoice, convertSpeedToRate }
) {
    app.post("/api/tts-expressive", async (req, res) => {
        let tempRoot = null;

        try {
            const {
                text,
                voiceName,
                speed = 1,
                mode = "intelligent"
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

            if (mode === "normal") {
                return res.status(400).json({
                    error: "Le mode Normal utilise la lecture standard."
                });
            }

            const microsoftVoice =
                findMicrosoftVoice(voiceName);

            if (!microsoftVoice) {
                return res.status(400).json({
                    error: "Cette voix Microsoft n'est pas autorisée."
                });
            }

            const segments =
                splitTextForExpression(text);

            if (!segments.length) {
                return res.status(400).json({
                    error: "Impossible d'analyser le texte."
                });
            }

            tempRoot = path.join(
                os.tmpdir(),
                `naturalreader-expressive-${crypto.randomUUID()}`
            );

            await fs.mkdir(tempRoot, {
                recursive: true
            });

            const generated = await Promise.all(
                segments.map(async (segment, index) => {
                    const analysis =
                        analyzeSegment(
                            segment,
                            mode,
                            index,
                            segments.length
                        );

                    const baseSpeed =
                        Number(speed) || 1;

                    const effectiveSpeed =
                        Math.max(
                            0.5,
                            Math.min(
                                2,
                                baseSpeed *
                                analysis.rateMultiplier
                            )
                        );

                    const rate =
                        convertSpeedToRate(
                            effectiveSpeed
                        );

                    const audioPath = path.join(
                        tempRoot,
                        `segment-${String(index).padStart(4, "0")}.mp3`
                    );

                    const silencePath = path.join(
                        tempRoot,
                        `silence-${String(index).padStart(4, "0")}.mp3`
                    );

                    const tts = new EdgeTTS({
                        voice: microsoftVoice,
                        outputFormat:
                            "audio-24khz-48kbitrate-mono-mp3",
                        rate,
                        pitch: analysis.pitch,
                        volume: "default"
                    });

                    await tts.ttsPromise(
                        segment,
                        audioPath
                    );

                    await createSilence(
                        silencePath,
                        analysis.pauseAfterMs
                    );

                    return {
                        index,
                        audioPath,
                        silencePath
                    };
                })
            );

            const concatList =
                path.join(
                    tempRoot,
                    "concat.txt"
                );

            const ordered =
                generated.sort(
                    (a, b) => a.index - b.index
                );

            const concatLines = [];

            for (const item of ordered) {
                concatLines.push(
                    `file '${item.audioPath.replace(/\\/g, "/")}'`
                );

                concatLines.push(
                    `file '${item.silencePath.replace(/\\/g, "/")}'`
                );
            }

            await fs.writeFile(
                concatList,
                concatLines.join("\n"),
                "utf8"
            );

            const finalPath =
                path.join(
                    tempRoot,
                    "NaturalReader-expressive.mp3"
                );

            await execFileAsync(
                ffmpegPath,
                [
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    concatList,
                    "-c:a",
                    "libmp3lame",
                    "-b:a",
                    "48k",
                    "-ar",
                    "24000",
                    "-ac",
                    "1",
                    finalPath
                ],
                {
                    windowsHide: true
                }
            );

            const buffer =
                await fs.readFile(finalPath);

            res.set({
                "Content-Type": "audio/mpeg",
                "Content-Length": buffer.length,
                "Content-Disposition":
                    'attachment; filename="NaturalReader-audio.mp3"',
                "Cache-Control": "no-cache",
                "X-NaturalReader-Mode": mode,
                "X-NaturalReader-Segments":
                    String(segments.length)
            });

            res.send(buffer);

        } catch (error) {
            console.error(
                "Erreur lecture expressive NaturalReader :",
                error
            );

            if (!res.headersSent) {
                res.status(500).json({
                    error:
                        "Impossible de générer la lecture expressive.",
                    details: error.message
                });
            }

        } finally {
            if (tempRoot) {
                try {
                    await fs.rm(
                        tempRoot,
                        {
                            recursive: true,
                            force: true
                        }
                    );
                } catch {
                    // Nettoyage temporaire.
                }
            }
        }
    });
}

module.exports = {
    registerExpressiveTTS
};
