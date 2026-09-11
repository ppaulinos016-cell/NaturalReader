const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const { EdgeTTS } = require("node-edge-tts");
const ffmpegPath = require("ffmpeg-static");
const VIDEO_RENDER_WIDTH = process.platform === "linux" ? 1280 : 1920;
const VIDEO_RENDER_HEIGHT = process.platform === "linux" ? 720 : 1080;
const VIDEO_RENDER_FPS = process.platform === "linux" ? 24 : 30;
const VIDEO_RENDER_PRESET = process.platform === "linux" ? "veryfast" : "medium";
const VIDEO_RENDER_CRF = process.platform === "linux" ? "23" : "18";

const { analyzeText } =
    require("./scene-analyzer");

const { findAndDownloadImage } =
    require("./image-search");

const execFileAsync = promisify(execFile);

const VOICES = {
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
    const entry =
        Object.entries(VOICES).find(
            ([displayName]) =>
                String(voiceName)
                    .toLowerCase()
                    .includes(displayName.toLowerCase())
        );

    return entry ? entry[1] : null;
}

function getMotionFilter(action, index) {
    const safeAction =
        String(action || "static").toLowerCase();

    const variation =
        Math.abs(Number(index || 0)) % 6;

    const base =
        "scale=${VIDEO_RENDER_WIDTH}:${VIDEO_RENDER_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_RENDER_WIDTH}:${VIDEO_RENDER_HEIGHT}";

    const motions = {
        walking: [
            `${base},zoompan=z='min(zoom+0.00055,1.10)':x='if(eq(on,1),0,min(x+0.65,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='min(zoom+0.00045,1.08)':x='iw/2-(iw/zoom/2)':y='if(eq(on,1),0,max(y-0.35,0))':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ],
        running: [
            `${base},zoompan=z='min(zoom+0.0009,1.13)':x='if(eq(on,1),0,min(x+1.2,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='min(zoom+0.0008,1.12)':x='if(eq(on,1),iw-iw/zoom,max(x-1.2,0))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ],
        flying: [
            `${base},zoompan=z='1.05':x='if(eq(on,1),iw/2-(iw/zoom/2),min(x+0.55,iw-iw/zoom))':y='if(eq(on,1),ih/2-(ih/zoom/2),max(y-0.5,0))':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='min(zoom+0.00045,1.09)':x='if(eq(on,1),iw/2-(iw/zoom/2),max(x-0.55,0))':y='if(eq(on,1),ih/2-(ih/zoom/2),min(y+0.5,ih-ih/zoom))':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ],
        driving: [
            `${base},zoompan=z='min(zoom+0.0007,1.11)':x='if(eq(on,1),0,min(x+1.0,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='1.07':x='if(eq(on,1),iw-iw/zoom,max(x-1.0,0))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ],
        swimming: [
            `${base},zoompan=z='1.06':x='if(eq(on,1),0,min(x+0.45,iw-iw/zoom))':y='if(eq(on,1),ih/2-(ih/zoom/2),max(y-0.2,0))':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='min(zoom+0.0004,1.09)':x='if(eq(on,1),iw/2-(iw/zoom/2),max(x-0.45,0))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ],
        dancing: [
            `${base},zoompan=z='1.035+0.015*sin(on/12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='1.06+0.012*sin(on/10)':x='if(eq(on,1),0,min(x+0.35,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ],
        rising: [
            `${base},zoompan=z='min(zoom+0.0005,1.10)':x='iw/2-(iw/zoom/2)':y='if(eq(on,1),ih/2-(ih/zoom/2),max(y-0.55,0))':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='1.06':x='iw/2-(iw/zoom/2)':y='if(eq(on,1),0,min(y+0.35,ih-ih/zoom))':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ],
        falling: [
            `${base},zoompan=z='1.07':x='iw/2-(iw/zoom/2)':y='if(eq(on,1),ih/2-(ih/zoom/2),min(y+0.55,ih-ih/zoom))':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='min(zoom+0.00045,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ],
        speaking: [
            `${base},zoompan=z='1.04':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='min(zoom+0.0004,1.08)':x='if(eq(on,1),0,min(x+0.35,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ],
        working: [
            `${base},zoompan=z='1.045+0.010*sin(on/18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='1.05':x='if(eq(on,1),0,min(x+0.4,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ],
        static: [
            `${base},zoompan=z='1.035+0.012*sin(on/45)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='min(zoom+0.0004,1.08)':x='if(eq(on,1),0,min(x+0.45,iw-iw/zoom))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='1.06':x='if(eq(on,1),iw-iw/zoom,max(x-0.45,0))':y='ih/2-(ih/zoom/2)':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`,
            `${base},zoompan=z='1.055':x='iw/2-(iw/zoom/2)':y='if(eq(on,1),0,min(y+0.35,ih-ih/zoom))':d=150:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:fps=${VIDEO_RENDER_FPS}`
        ]
    };

    const selected =
        motions[safeAction] ||
        motions.static;

    return selected[
        variation % selected.length
    ];
}

async function generateSceneAudio(
    text,
    voiceId,
    rate,
    pitch,
    outputPath
) {
    const tts =
        new EdgeTTS({
            voice: voiceId,
            outputFormat:
                "audio-24khz-48kbitrate-mono-mp3",
            rate,
            pitch,
            volume: "default"
        });

    await tts.ttsPromise(
        text,
        outputPath
    );
}

async function getAudioDuration(audioPath) {
    try {
        const result =
            await execFileAsync(
                ffmpegPath,
                [
                    "-hide_banner",
                    "-i",
                    audioPath,
                    "-f",
                    "null",
                    "-"
                ],
                {
                    windowsHide: true
                }
            );

        const output =
            String(result.stderr || "") +
            "\n" +
            String(result.stdout || "");

        const match =
            output.match(
                /Duration:\s*(\d+):(\d+):([\d.]+)/
            );

        if (!match) {
            throw new Error(
                "Impossible de déterminer la durée audio."
            );
        }

        return (
            Number(match[1]) * 3600 +
            Number(match[2]) * 60 +
            Number(match[3])
        );
    } catch (error) {
        const output =
            String(error.stderr || "") +
            "\n" +
            String(error.stdout || "");

        const match =
            output.match(
                /Duration:\s*(\d+):(\d+):([\d.]+)/
            );

        if (!match) {
            throw new Error(
                "Impossible de déterminer la durée audio."
            );
        }

        return (
            Number(match[1]) * 3600 +
            Number(match[2]) * 60 +
            Number(match[3])
        );
    }
}

function wrapSubtitle(
    text,
    maxChars = 58
) {
    const words =
        String(text || "")
            .replace(/\s+/g, " ")
            .trim()
            .split(" ")
            .filter(Boolean);

    if (!words.length) {
        return "";
    }

    const lines = [];
    let current = "";

    for (const word of words) {
        const candidate =
            current
                ? `${current} ${word}`
                : word;

        if (
            candidate.length <= maxChars ||
            !current
        ) {
            current = candidate;
        } else {
            lines.push(current);
            current = word;

            if (lines.length === 1) {
                continue;
            }

            break;
        }
    }

    if (
        current &&
        lines.length < 2
    ) {
        lines.push(current);
    }

    return lines
        .slice(0, 2)
        .join("\n");
}

const DRAW_TEXT_FONT = process.platform === "win32" ? "C:/Windows/Fonts/arial.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

function escapeDrawtextText(
    value
) {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'")
        .replace(/%/g, "\\%");
}


async function renderScene(
    imagePath,
    audioPath,
    outputPath,
    action,
    index,
    subtitleText
) {
    await fs.mkdir(
        path.dirname(outputPath),
        {
            recursive: true
        }
    );

    const subtitlePath =
        outputPath + ".srt";

    const subtitle =
        String(subtitleText || "")
            .replace(/\\/g, " ")
            .replace(/\r?\n/g, " ")
            .trim();

    const srtContent =
        "1\n" +
        "00:00:00,000 --> 99:59:59,000\n" +
        subtitle +
        "\n";

    await fs.writeFile(
        subtitlePath,
        srtContent,
        "utf8"
    );

    const subtitleFile =
        subtitlePath
            .replace(/\\/g, "/")
            .replace(/:/g, "\\:")
            .replace(/'/g, "\\'");

    const filter =
        getMotionFilter(
            action,
            index
        ) +
        ",setsar=1,setdar=16/9" +
        ",unsharp=5:5:0.55:5:5:0.0" +
        ",eq=contrast=1.05:brightness=0.01:saturation=1.04" +
        ",subtitles='" +
        subtitleFile +
        "':force_style='FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BackColour=&H99000000&,BorderStyle=4,Outline=2,Shadow=0,Alignment=2,MarginV=55'";

    try {
        await execFileAsync(
            ffmpegPath,
            [
                "-y",
                "-loop",
                "1",
                "-i",
                imagePath,
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
                "medium",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-r",
                "30",
                "-aspect",
                "16:9",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-ar",
                "24000",
                "-ac",
                "1",
                "-shortest",
                "-movflags",
                "+faststart",
                outputPath
            ],
            {
                windowsHide: true
            }
        );
    } finally {
        await fs.unlink(
            subtitlePath
        ).catch(() => {});
    }
}

async function renderTitleCard(
    outputPath,
    title,
    subtitle,
    duration = 2
) {
    await fs.mkdir(
        path.dirname(outputPath),
        {
            recursive: true
        }
    );

    const assPath =
        path.join(
            os.tmpdir(),
            `naturalreader-title-${crypto.randomUUID()}.ass`
        );

    function escapeAssText(value) {
        return String(value || "")
            .replace(/\\/g, "\\\\")
            .replace(/\{/g, "\\{")
            .replace(/\}/g, "\\}");
    }

    const titleText =
        escapeAssText(title);

    const subtitleText =
        escapeAssText(subtitle);

    const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${VIDEO_RENDER_WIDTH}
PlayResY: ${VIDEO_RENDER_HEIGHT}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,Arial,86,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,5,40,40,0,1
Style: Subtitle,Arial,44,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:${String(duration).padStart(4, "0")}.00,Title,,0,0,0,,${titleText}
Dialogue: 1,0:00:00.00,0:00:${String(duration).padStart(4, "0")}.00,Subtitle,,0,0,0,,${subtitleText}
`;

    await fs.writeFile(
        assPath,
        assContent,
        "utf8"
    );

    const subtitleFilterPath =
        assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

    const filter =
        `subtitles='${subtitleFilterPath}'` +
        ",fade=t=in:st=0:d=0.35" +
        `,fade=t=out:st=${Math.max(
            0.4,
            duration - 0.35
        )}:d=0.35`;

    try {
        await execFileAsync(
            ffmpegPath,
            [
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=0x07111f:s=${VIDEO_RENDER_WIDTH}x${VIDEO_RENDER_HEIGHT}:r=${VIDEO_RENDER_FPS}",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=mono:sample_rate=24000",
                "-t",
                String(duration),
                "-vf",
                filter,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-r",
                "30",
                "-aspect",
                "16:9",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-ar",
                "24000",
                "-ac",
                "1",
                "-shortest",
                "-movflags",
                "+faststart",
                outputPath
            ],
            {
                windowsHide: true
            }
        );
    } catch (error) {
        const details =
            String(error.stderr || "") +
            "\n" +
            String(error.stdout || "");

        throw new Error(
            `Carte vidéo impossible à créer. ${details}`
        );
    } finally {
        await fs.unlink(
            assPath
        ).catch(() => {});
    }
}
async function assembleSceneVideos(
    sceneFiles,
    outputPath
) {
    const concatFile =
        path.join(
            os.tmpdir(),
            `naturalreader-concat-${crypto.randomUUID()}.txt`
        );

    const content =
        sceneFiles
            .map(
                file =>
                    `file '${file.replace(
                        /\\/g,
                        "/"
                    )}'`
            )
            .join("\n");

    await fs.writeFile(
        concatFile,
        content,
        "utf8"
    );

    try {
        await execFileAsync(
            ffmpegPath,
            [
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concatFile,
                "-vf",
                `scale=${VIDEO_RENDER_WIDTH}:${VIDEO_RENDER_HEIGHT},setsar=1,setdar=16/9`,
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-r",
                "30",
                "-aspect",
                "16:9",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-ar",
                "24000",
                "-ac",
                "1",
                "-movflags",
                "+faststart",
                outputPath
            ],
            {
                windowsHide: true
            }
        );
    } finally {
        await fs.unlink(
            concatFile
        ).catch(() => {});
    }
}

async function buildReel({
    text,
    voiceName,
    speed = 1,
    mode = "intelligent"
}) {
    const voiceId =
        getVoiceId(
            voiceName
        );

    if (!voiceId) {
        throw new Error(
            "Voix Microsoft non autorisée."
        );
    }

    const settings =
        MODE_SETTINGS[mode] ||
        MODE_SETTINGS.intelligent;

    const analysis =
        await analyzeText(
            text,
            mode
        );

    const scenes =
        analysis?.scenes || [];

    if (!scenes.length) {
        throw new Error(
            "Aucune scène détectée."
        );
    }

    const tempRoot =
        path.join(
            os.tmpdir(),
            `naturalreader-reel-${crypto.randomUUID()}`
        );

    const outputDir =
        path.join(__dirname, "output");

    await fs.mkdir(
        tempRoot,
        {
            recursive: true
        }
    );

    await fs.mkdir(
        outputDir,
        {
            recursive: true
        }
    );

    const sceneFiles = [];
    const sceneReport = [];
    const successfulImages = [];

    try {
        const introPath =
            path.join(
                tempRoot,
                "intro.mp4"
            );

        await renderTitleCard(
            introPath,
            "NATURAL READER",
            "Lecteur vocal naturel",
            2
        );

        sceneFiles.push(
            introPath
        );

        for (
            let index = 0;
            index < scenes.length;
            index++
        ) {
            const scene =
                scenes[index];

            console.log(
                `NaturalReader Reel : scène ${index + 1}/${scenes.length}`,
                {
                    narration:
                        scene.narration,
                    subject:
                        scene.subject,
                    location:
                        scene.location,
                    action:
                        scene.action
                }
            );

            let imageResult;

            try {
                imageResult =
                    await findAndDownloadImage(
                        scene,
                        index
                    );

                if (
                    imageResult?.localPath
                ) {
                    successfulImages.push(
                        imageResult
                    );
                }
            } catch (imageError) {
                console.warn(
                    `Image indisponible pour la scène ${index + 1}: ${imageError.message}`
                );

                if (
                    index > 0 &&
                    successfulImages.length
                ) {
                    imageResult =
                        successfulImages[
                            (index - 1) %
                                successfulImages.length
                        ];

                    console.warn(
                        `Réutilisation d'une image déjà trouvée pour la scène ${index + 1}.`
                    );
                } else {
                    throw new Error(
                        `Aucune image de recherche disponible pour la première scène. ${imageError.message}`
                    );
                }
            }

            const audioPath =
                path.join(
                    tempRoot,
                    `audio-${String(index).padStart(3, "0")}.mp3`
                );

            const videoPath =
                path.join(
                    tempRoot,
                    `scene-${String(index).padStart(3, "0")}.mp4`
                );

            const effectiveSpeed =
                Math.max(
                    0.5,
                    Math.min(
                        2,
                        Number(speed || 1) *
                            settings.rate
                    )
                );

            await generateSceneAudio(
                scene.narration,
                voiceId,
                convertSpeedToRate(
                    effectiveSpeed
                ),
                settings.pitch,
                audioPath
            );

            const duration =
                await getAudioDuration(
                    audioPath
                );

            await renderScene(
                imageResult.localPath,
                audioPath,
                videoPath,
                scene.action,
                index,
                scene.narration
            );

            sceneFiles.push(
                videoPath
            );

            sceneReport.push({
                index,
                narration:
                    scene.narration,
                subject:
                    scene.subject,
                location:
                    scene.location,
                action:
                    scene.action,
                image:
                    imageResult.title ||
                    "Image recherchée",
                imagePath:
                    imageResult.localPath,
                duration
            });
        }

        const outroPath =
            path.join(
                tempRoot,
                "outro.mp4"
            );

        await renderTitleCard(
            outroPath,
            "Appréciation",
            "par Natural Reader",
            2
        );

        sceneFiles.push(
            outroPath
        );

        const finalPath =
            path.join(
                outputDir,
                `NaturalReader-Reel-${Date.now()}.mp4`
            );

        await assembleSceneVideos(
            sceneFiles,
            finalPath
        );

        return {
            outputPath:
                finalPath,
            sceneCount:
                scenes.length,
            scenes:
                sceneReport,
            subtitles:
                sceneReport.map(
                    scene => ({
                        index:
                            scene.index,
                        text:
                            scene.narration,
                        duration:
                            scene.duration
                    })
                ),
            format: {
                width: 1920,
                height: 1080,
                aspect: "16:9"
            }
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

module.exports = {
    buildReel
};








