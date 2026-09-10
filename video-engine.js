const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const ffmpegPath = require("ffmpeg-static");
const { EdgeTTS } = require("node-edge-tts");

const execFileAsync = promisify(execFile);

const MICROSOFT_VOICES = {
    "Microsoft Denise Online (Natural)": "fr-FR-DeniseNeural",
    "Microsoft Eloise Online (Natural)": "fr-FR-EloiseNeural",
    "Microsoft Jean Online (Natural)": "fr-CA-JeanNeural",
    "Microsoft Maisie Online (Natural)": "en-GB-MaisieNeural",
    "Microsoft Ezinne Online (Natural)": "en-NG-EzinneNeural",
    "Microsoft Seraphina Mehrsprachig Online (Natural)": "de-DE-SeraphinaMultilingualNeural",
    "Microsoft Conrad Online (Natural)": "de-DE-ConradNeural"
};

const MODE_SETTINGS = {
    normal: { rate: 1.00, pitch: "default" },
    positive: { rate: 1.04, pitch: "+4Hz" },
    joyful: { rate: 1.08, pitch: "+7Hz" },
    sad: { rate: 0.90, pitch: "-5Hz" },
    calm: { rate: 0.92, pitch: "+0Hz" },
    poetic: { rate: 0.90, pitch: "+3Hz" },
    narrative: { rate: 1.00, pitch: "+2Hz" },
    dramatic: { rate: 0.98, pitch: "+6Hz" },
    energetic: { rate: 1.10, pitch: "+7Hz" },
    serious: { rate: 0.94, pitch: "-2Hz" },
    enthusiastic: { rate: 1.12, pitch: "+9Hz" },
    mysterious: { rate: 0.90, pitch: "-3Hz" },
    educational: { rate: 0.94, pitch: "+2Hz" },
    news: { rate: 1.00, pitch: "+1Hz" },
    story: { rate: 0.94, pitch: "+4Hz" },
    speech: { rate: 0.98, pitch: "+3Hz" },
    intelligent: { rate: 1.02, pitch: "+2Hz" }
};

function convertSpeedToRate(speed) {
    const value = Number(speed);

    if (!Number.isFinite(value)) {
        return "+0%";
    }

    const percent = Math.round((value - 1) * 100);

    return `${percent >= 0 ? "+" : ""}${percent}%`;
}

function getVoiceId(voiceName) {
    if (!voiceName) {
        return null;
    }

    const entry = Object.entries(MICROSOFT_VOICES).find(
        ([displayName]) =>
            voiceName.toLowerCase().includes(
                displayName.toLowerCase()
            )
    );

    return entry ? entry[1] : null;
}

function getModeSettings(mode) {
    return MODE_SETTINGS[mode] || MODE_SETTINGS.intelligent;
}

function createDynamicVideoFilter(mode) {
    const filters = {
        joyful:
            "scale=1280:720,zoompan=z='min(zoom+0.0008,1.18)':d=900:s=1280x720:fps=30",
        positive:
            "scale=1280:720,zoompan=z='min(zoom+0.0005,1.12)':d=900:s=1280x720:fps=30",
        calm:
            "scale=1280:720,zoompan=z='1.05+0.02*sin(on/40)':d=900:s=1280x720:fps=30",
        poetic:
            "scale=1280:720,zoompan=z='1.08+0.035*sin(on/55)':d=900:s=1280x720:fps=30",
        dramatic:
            "scale=1280:720,zoompan=z='1.02+0.06*sin(on/28)':d=900:s=1280x720:fps=30",
        energetic:
            "scale=1280:720,zoompan=z='min(zoom+0.001,1.22)':d=900:s=1280x720:fps=30",
        mysterious:
            "scale=1280:720,zoompan=z='1.10+0.03*sin(on/70)':d=900:s=1280x720:fps=30"
    };

    return filters[mode] ||
        "scale=1280:720,zoompan=z='1.04+0.02*sin(on/50)':d=900:s=1280x720:fps=30";
}

async function generateVideo({
    text,
    voiceName,
    speed = 1,
    mode = "intelligent"
}) {
    const voiceId = getVoiceId(voiceName);

    if (!voiceId) {
        throw new Error(
            "Cette voix Microsoft n'est pas autorisée."
        );
    }

    const settings = getModeSettings(mode);

    const tempRoot = path.join(
        os.tmpdir(),
        `naturalreader-video-${crypto.randomUUID()}`
    );

    await fs.mkdir(tempRoot, {
        recursive: true
    });

    const audioPath = path.join(
        tempRoot,
        "voice.mp3"
    );

    const videoPath = path.join(
        tempRoot,
        "NaturalReader-video.mp4"
    );

    try {
        const baseSpeed =
            Number(speed) || 1;

        const effectiveSpeed =
            Math.max(
                0.5,
                Math.min(
                    2,
                    baseSpeed * settings.rate
                )
            );

        const rate =
            convertSpeedToRate(
                effectiveSpeed
            );

        const tts = new EdgeTTS({
            voice: voiceId,
            outputFormat:
                "audio-24khz-48kbitrate-mono-mp3",
            rate,
            pitch: settings.pitch,
            volume: "default"
        });

        await tts.ttsPromise(
            text.trim(),
            audioPath
        );

        const filter =
            createDynamicVideoFilter(mode);

        await execFileAsync(
            ffmpegPath,
            [
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=1280x720:rate=30",
                "-i",
                audioPath,
                "-vf",
                filter,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-shortest",
                "-movflags",
                "+faststart",
                videoPath
            ],
            {
                windowsHide: true
            }
        );

        const buffer =
            await fs.readFile(videoPath);

        return {
            buffer,
            mode,
            voice: voiceName,
            size: buffer.length
        };

    } finally {
        await fs.rm(
            tempRoot,
            {
                recursive: true,
                force: true
            }
        ).catch(() => {});
    }
}

function registerVideoEngine(app) {
    app.post(
        "/api/generate-video",
        async (req, res) => {
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
                        error:
                            "Aucune voix Microsoft n'a été sélectionnée."
                    });
                }

                const result =
                    await generateVideo({
                        text,
                        voiceName,
                        speed,
                        mode,
                        language
                    });

                res.set({
                    "Content-Type": "video/mp4",
                    "Content-Length": result.size,
                    "Content-Disposition":
                        'attachment; filename="NaturalReader-video.mp4"',
                    "Cache-Control": "no-cache",
                    "X-NaturalReader-Voice":
                        result.voice,
                    "X-NaturalReader-Mode":
                        result.mode
                });

                res.send(result.buffer);

            } catch (error) {
                console.error(
                    "Erreur génération vidéo NaturalReader :",
                    error
                );

                if (!res.headersSent) {
                    res.status(500).json({
                        error:
                            "Impossible de générer la vidéo.",
                        details: error.message
                    });
                }
            }
        }
    );
}

module.exports = {
    registerVideoEngine
};
