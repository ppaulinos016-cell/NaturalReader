const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const ffmpegPath = require("ffmpeg-static");

const execFileAsync = promisify(execFile);

const VIDEO_RENDER_WIDTH = 1920;
const VIDEO_RENDER_HEIGHT = 1080;
const VIDEO_RENDER_FPS = 30;

function escapeFilterValue(value) {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'");
}

function describeScene(scene) {
    return [
        scene?.characters?.join(", "),
        scene?.locations?.join(", "),
        scene?.actions?.join(", "),
        scene?.objects?.join(", "),
        scene?.weather?.join(", "),
        scene?.time?.join(", "),
        scene?.era,
        scene?.atmosphere,
        scene?.progression,
        scene?.visualPrompt
    ]
        .filter(Boolean)
        .join(" | ");
}

async function createProceduralBackground(outputPath, duration = 5) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const safeDuration =
        Math.max(1, Number(duration) || 5);

    await execFileAsync(
        ffmpegPath,
        [
            "-y",
            "-f",
            "lavfi",
            "-i",
            `gradients=s=1920x1080:r=${VIDEO_RENDER_FPS}:duration=${safeDuration}`,
            "-vf",
            [
                "format=yuv420p",
                "eq=contrast=1.03:saturation=1.08",
                "gblur=sigma=0.4"
            ].join(","),
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-r",
            String(VIDEO_RENDER_FPS),
            "-pix_fmt",
            "yuv420p",
            "-t",
            String(safeDuration),
            outputPath
        ],
        {
            windowsHide: true
        }
    );

    return outputPath;
}

async function createAnimatedScene({
    scene,
    outputPath,
    duration = 5
}) {
    if (!scene) {
        throw new Error("SCENE_REQUIRED");
    }

    await fs.mkdir(
        path.dirname(outputPath),
        { recursive: true }
    );

    const description =
        describeScene(scene);

    console.log(
        "Creative Scene Engine :",
        description
    );

    /*
     * Première couche du moteur :
     * génération procédurale indépendante des images web.
     *
     * Cette fonction sera ensuite enrichie avec :
     * - personnages animés
     * - actions narratives
     * - environnement animé
     * - caméra cinématique
     * - météo et particules
     * - continuité entre scènes
     *
     * Aucun appel Openverse/Wikimedia ici.
     */

    await createProceduralBackground(
        outputPath,
        duration
    );

    return {
        localPath: outputPath,
        duration,
        sceneSignature: {
            characters:
                scene.characters || [],
            locations:
                scene.locations || [],
            actions:
                scene.actions || [],
            objects:
                scene.objects || [],
            visualPrompt:
                scene.visualPrompt || ""
        }
    };
}

module.exports = {
    createAnimatedScene,
    describeScene
};
