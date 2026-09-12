const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const sharp = require("sharp");
const ffmpegPath = require("ffmpeg-static");

const execFileAsync = promisify(execFile);

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;

const ACTIONS = {
    walking: "walking",
    running: "running",
    jumping: "jumping",
    dancing: "dancing",
    rising: "rising",
    falling: "falling",
    speaking: "speaking",
    working: "working",
    swimming: "swimming",
    flying: "flying",
    driving: "driving",
    static: "static"
};

function normalizeAction(action) {
    const value = String(action || "").toLowerCase().trim();

    if (value.includes("march") || value.includes("walk")) return "walking";
    if (value.includes("cour") || value.includes("run")) return "running";
    if (value.includes("saut") || value.includes("jump")) return "jumping";
    if (value.includes("dans") || value.includes("dance")) return "dancing";
    if (value.includes("tombe") || value.includes("fall")) return "falling";
    if (value.includes("vole") || value.includes("fly")) return "flying";
    if (value.includes("nage") || value.includes("swim")) return "swimming";
    if (value.includes("conduit") || value.includes("driv")) return "driving";
    if (value.includes("travail") || value.includes("work")) return "working";
    if (value.includes("parle") || value.includes("speak")) return "speaking";
    if (value.includes("monte") || value.includes("rise")) return "rising";

    return ACTIONS[value] || "static";
}

function characterSvg(action, frame, totalFrames) {
    const t = frame / Math.max(1, totalFrames - 1);
    const cycle = Math.sin(t * Math.PI * 2);
    const cycle2 = Math.sin(t * Math.PI * 4);

    let x = 640;
    let y = 385;
    let armL = 0;
    let armR = 0;
    let legL = 0;
    let legR = 0;
    let bodyTilt = 0;
    let headTilt = 0;

    switch (action) {
        case "walking":
            x = 500 + t * 280;
            armL = cycle * 18;
            armR = -cycle * 18;
            legL = -cycle * 15;
            legR = cycle * 15;
            bodyTilt = cycle * 1.5;
            break;

        case "running":
            x = 420 + t * 420;
            armL = cycle * 32;
            armR = -cycle * 32;
            legL = -cycle * 38;
            legR = cycle * 38;
            bodyTilt = -6;
            break;

        case "jumping":
            y = 385 - Math.abs(Math.sin(t * Math.PI * 2)) * 145;
            armL = -25 + cycle * 12;
            armR = 25 - cycle * 12;
            legL = cycle * 25;
            legR = -cycle * 25;
            break;

        case "dancing":
            y = 385 + cycle * 15;
            armL = cycle * 55;
            armR = -cycle * 55;
            legL = cycle2 * 25;
            legR = -cycle2 * 25;
            bodyTilt = cycle * 7;
            headTilt = cycle * 5;
            break;

        case "rising":
            y = 470 - t * 170;
            armL = -20;
            armR = 20;
            break;

        case "falling":
            y = 300 + t * 170;
            bodyTilt = t * 35;
            armL = cycle * 35;
            armR = -cycle * 35;
            break;

        case "speaking":
            armL = cycle * 7;
            armR = -cycle * 7;
            headTilt = cycle * 2;
            break;

        case "working":
            armL = -35 + cycle * 12;
            armR = 35 - cycle * 12;
            bodyTilt = -5;
            break;

        case "swimming":
            y = 430 + cycle * 18;
            armL = cycle * 50;
            armR = -cycle * 50;
            bodyTilt = -8;
            break;

        case "flying":
            y = 350 + cycle * 25;
            armL = -65 + cycle * 15;
            armR = 65 - cycle * 15;
            legL = cycle * 10;
            legR = -cycle * 10;
            break;

        case "driving":
            x = 640 + cycle * 12;
            armL = -18 + cycle * 4;
            armR = 18 - cycle * 4;
            break;

        default:
            y = 385 + cycle * 3;
            break;
    }

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#78b9df"/>
            <stop offset="1" stop-color="#d8eef4"/>
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#77a85d"/>
            <stop offset="1" stop-color="#345b3b"/>
        </linearGradient>
        <radialGradient id="face">
            <stop offset="0" stop-color="#f2c9a5"/>
            <stop offset="1" stop-color="#c98765"/>
        </radialGradient>
        <filter id="soft">
            <feGaussianBlur stdDeviation="0.7"/>
        </filter>
    </defs>

    <rect width="1280" height="720" fill="url(#sky)"/>
    <circle cx="1040" cy="125" r="58" fill="#fff1b0" opacity=".9"/>

    <path d="M0 470 Q180 360 360 455 T720 435 T1080 450 T1280 410 V720 H0Z"
          fill="#638c59"/>
    <path d="M0 545 Q220 455 440 540 T860 520 T1280 500 V720 H0Z"
          fill="url(#ground)"/>

    <g opacity=".8">
        <path d="M95 525 Q125 440 155 525" stroke="#284b35" stroke-width="14" fill="none"/>
        <path d="M1090 525 Q1120 430 1150 525" stroke="#284b35" stroke-width="14" fill="none"/>
        <circle cx="125" cy="448" r="38" fill="#47784b"/>
        <circle cx="1130" cy="440" r="43" fill="#47784b"/>
    </g>

    <g transform="translate(${x} ${y}) rotate(${bodyTilt})">
        <!-- shadow -->
        <ellipse cx="0" cy="154" rx="75" ry="17" fill="#203b29" opacity=".35" filter="url(#soft)"/>

        <!-- legs -->
        <g transform="rotate(${legL} 0 92)">
            <path d="M-35 78 L-28 150 Q-25 168 -8 168 L8 168 Q13 155 1 145 L5 85Z"
                  fill="#344d70"/>
            <path d="M-10 164 Q-2 153 16 160 L39 173 Q45 184 31 190 L-3 185Z"
                  fill="#3b3030"/>
        </g>

        <g transform="rotate(${legR} 25 92)">
            <path d="M8 82 L28 148 Q33 165 48 168 L63 163 Q67 151 54 142 L45 78Z"
                  fill="#344d70"/>
            <path d="M42 160 Q53 151 67 160 L88 177 Q91 188 77 192 L43 183Z"
                  fill="#3b3030"/>
        </g>

        <!-- body -->
        <path d="M-48 20 Q0 -8 48 20 L58 100 Q35 123 0 120 Q-35 123 -58 100Z"
              fill="#4d7288"/>

        <!-- left arm -->
        <g transform="rotate(${armL} -48 30)">
            <path d="M-45 28 Q-78 45 -92 94 Q-97 113 -80 121 Q-62 125 -55 106 L-28 55Z"
                  fill="#d89f7d"/>
            <path d="M-48 28 L-28 55 L-55 106 L-76 98 L-66 55Z"
                  fill="#496d82" opacity=".95"/>
            <circle cx="-78" cy="113" r="11" fill="#d89f7d"/>
        </g>

        <!-- right arm -->
        <g transform="rotate(${armR} 48 30)">
            <path d="M45 28 Q78 45 92 94 Q97 113 80 121 Q62 125 55 106 L28 55Z"
                  fill="#d89f7d"/>
            <path d="M48 28 L28 55 L55 106 L76 98 L66 55Z"
                  fill="#496d82" opacity=".95"/>
            <circle cx="78" cy="113" r="11" fill="#d89f7d"/>
        </g>

        <!-- neck -->
        <rect x="-15" y="-8" width="30" height="30" rx="12" fill="#d89f7d"/>

        <!-- head -->
        <g transform="rotate(${headTilt})">
            <ellipse cx="0" cy="-42" rx="58" ry="66" fill="url(#face)"/>
            <path d="M-58 -48 Q-55 -112 0 -112 Q58 -110 60 -48
                     Q43 -69 28 -57 Q10 -78 -7 -58 Q-30 -75 -58 -48Z"
                  fill="#342923"/>
            <ellipse cx="-20" cy="-42" rx="7" ry="10" fill="#241c1b"/>
            <ellipse cx="20" cy="-42" rx="7" ry="10" fill="#241c1b"/>
            <circle cx="-18" cy="-44" r="2.5" fill="white"/>
            <circle cx="22" cy="-44" r="2.5" fill="white"/>
            <path d="M-15 -13 Q0 -4 15 -13" stroke="#733f39" stroke-width="4" fill="none"/>
            <path d="M-30 -58 Q-18 -65 -8 -59 M8 -59 Q20 -65 31 -58"
                  stroke="#382622" stroke-width="5" fill="none"/>
        </g>
    </g>

    <text x="45" y="62" font-family="Arial" font-size="27"
          fill="white" opacity=".9">NaturalReader • ${action}</text>
</svg>`;
}

async function renderActionVideo({
    action,
    outputPath,
    duration = 30
}) {
    const safeAction = normalizeAction(action);
    const safeDuration = Math.max(5, Number(duration) || 30);

    const root = path.dirname(outputPath);
    const frameDir = path.join(root, `.action-${Date.now()}-${safeAction}`);

    await fs.mkdir(frameDir, { recursive: true });

    try {
        const totalFrames = Math.ceil(safeDuration * FPS);

        for (let frame = 0; frame < totalFrames; frame++) {
            const svg = characterSvg(safeAction, frame, totalFrames);
            const framePath = path.join(
                frameDir,
                `frame-${String(frame).padStart(5, "0")}.png`
            );

            await sharp(Buffer.from(svg))
                .png()
                .toFile(framePath);
        }

        await execFileAsync(
            ffmpegPath,
            [
                "-y",
                "-framerate",
                String(FPS),
                "-i",
                path.join(frameDir, "frame-%05d.png"),
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-r",
                String(FPS),
                "-movflags",
                "+faststart",
                outputPath
            ],
            { windowsHide: true }
        );

        return {
            localPath: outputPath,
            action: safeAction,
            duration: safeDuration,
            fallback: false
        };
    } finally {
        await fs.rm(frameDir, {
            recursive: true,
            force: true
        }).catch(() => {});
    }
}

module.exports = {
    ACTIONS,
    normalizeAction,
    renderActionVideo
};
