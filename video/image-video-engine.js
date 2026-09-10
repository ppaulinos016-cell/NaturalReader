const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const ffmpegPath = require("ffmpeg-static");

const execFileAsync = promisify(execFile);

function getVideoFilter(index) {
    const filters = [
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0007,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=1080x1920:fps=30",
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='1.08':x='if(eq(on,1),0,x+1)':y='ih/2-(ih/zoom/2)':d=150:s=1080x1920:fps=30",
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0005,1.10)':x='iw/2-(iw/zoom/2)':y='if(eq(on,1),0,y+0.8)':d=150:s=1080x1920:fps=30",
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='1.10':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=1080x1920:fps=30"
    ];

    return filters[index % filters.length];
}

async function createScene(imagePath, outputPath, duration, index) {
    await execFileAsync(
        ffmpegPath,
        [
            "-y",
            "-loop",
            "1",
            "-i",
            imagePath,
            "-t",
            String(duration),
            "-vf",
            getVideoFilter(index),
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-an",
            outputPath
        ],
        {
            windowsHide: true
        }
    );
}

async function assembleScenes(sceneFiles, outputPath) {
    const concatFile = path.join(
        path.dirname(outputPath),
        "scenes.txt"
    );

    const content = sceneFiles
        .map(file =>
            `file '${file.replace(/\\/g, "/")}'`
        )
        .join("\n");

    await fs.writeFile(
        concatFile,
        content,
        "utf8"
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
            concatFile,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-movflags",
            "+faststart",
            outputPath
        ],
        {
            windowsHide: true
        }
    );
}

async function buildImageVideo({
    images,
    durations
}) {
    if (!Array.isArray(images) || images.length === 0) {
        throw new Error("Aucune image disponible.");
    }

    const root = path.join(
        os.tmpdir(),
        `naturalreader-scenes-${crypto.randomUUID()}`
    );

    const persistentOutputDir =
        "C:\\Users\\hp\\NaturalReader\\video\\output";

    await fs.mkdir(root, {
        recursive: true
    });

    await fs.mkdir(persistentOutputDir, {
        recursive: true
    });

    try {
        const sceneFiles = [];

        for (let i = 0; i < images.length; i++) {
            const scenePath = path.join(
                root,
                `scene-${String(i).padStart(3, "0")}.mp4`
            );

            await createScene(
                images[i],
                scenePath,
                Number(durations?.[i]) || 4,
                i
            );

            sceneFiles.push(scenePath);
        }

        const temporaryOutput = path.join(
            root,
            "visual-video.mp4"
        );

        await assembleScenes(
            sceneFiles,
            temporaryOutput
        );

        const finalOutput = path.join(
            persistentOutputDir,
            `NaturalReader-visual-${Date.now()}.mp4`
        );

        await fs.copyFile(
            temporaryOutput,
            finalOutput
        );

        return {
            output: finalOutput,
            sceneCount: images.length
        };

    } finally {
        await fs.rm(
            root,
            {
                recursive: true,
                force: true
            }
        ).catch(() => {});
    }
}

module.exports = {
    buildImageVideo
};
