require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require("docx");
const googleTranslate = require("googletrans").default;
const { EdgeTTS } = require("node-edge-tts");
const { registerExpressiveTTS } = require("./expressive-engine");
const { registerVideoEngine } = require("./video-engine");
const { buildReel } = require("./video/reel-engine");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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
            volume: "default",
            timeout: 120000
        });;

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

app.post("/api/tts-ewe", async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                error: "Le texte est vide."
            });
        }

        const eweTtsUrl =
            process.env.EWE_TTS_URL ||
            "http://127.0.0.1:8001/tts";

        const response = await fetch(
            eweTtsUrl,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    text: text.trim()
                })
            }
        );

        if (!response.ok) {
            const details =
                await response.text();

            return res.status(502).json({
                error:
                    "Le service TTS Éwé a retourné une erreur.",
                details
            });
        }

        const audioBuffer =
            Buffer.from(
                await response.arrayBuffer()
            );

        res.set({
            "Content-Type": "audio/wav",
            "Content-Length": audioBuffer.length,
            "Content-Disposition":
                'attachment; filename="NaturalReader-ewe.wav"',
            "Cache-Control": "no-cache"
        });

        res.send(audioBuffer);

    } catch (error) {
        console.error(
            "Erreur TTS Éwé :",
            error
        );

        if (!res.headersSent) {
            res.status(500).json({
                error:
                    "Impossible de générer la voix Éwé.",
                details:
                    error.message
            });
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
            mode,
            language
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
                encodeURIComponent(voiceName),
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


app.post("/api/translate", async (req, res) => {
    try {
        const {
            text,
            targetLanguage,
            sourceLanguage = "auto"
        } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                error: "Le texte à traduire est vide."
            });
        }

        if (!["fr", "en", "de", "ee"].includes(targetLanguage)) {
            return res.status(400).json({
                error: "Langue de traduction invalide."
            });
        }

        const source =
            ["fr", "en", "de", "ee"].includes(sourceLanguage)
                ? sourceLanguage
                : "auto";

        if (source === targetLanguage) {
            return res.json({
                text: text.trim(),
                sourceLanguage: source,
                targetLanguage,
                chunks: 1
            });
        }

        const normalized =
            text.replace(/\r\n/g, "\n").trim();

        const MAX_CHARS = 450;
        const chunks = [];
        let remaining = normalized;

        while (remaining.length > MAX_CHARS) {
            let cut =
                remaining.lastIndexOf("\n", MAX_CHARS);

            if (cut < 100) {
                cut =
                    remaining.lastIndexOf(" ", MAX_CHARS);
            }

            if (cut < 100) {
                cut = MAX_CHARS;
            }

            chunks.push(
                remaining.slice(0, cut).trim()
            );

            remaining =
                remaining.slice(cut).trimStart();
        }

        if (remaining) {
            chunks.push(remaining);
        }

        const translatedChunks = [];

        for (const chunk of chunks) {
            const options = {
                to: targetLanguage
            };

            if (source !== "auto") {
                options.from = source;
            }

            const result =
                await googleTranslate(
                    chunk,
                    options
                );

            const translated =
                result?.text?.trim();

            if (!translated) {
                throw new Error(
                    "Aucune traduction n'a été retournée."
                );
            }

            translatedChunks.push(
                translated
            );
        }

        const detectedSource =
            source === "auto"
                ? null
                : source;

        res.json({
            text: translatedChunks.join("\n\n").trim(),
            sourceLanguage: detectedSource,
            targetLanguage,
            chunks: translatedChunks.length
        });

    } catch (error) {
        console.error(
            "Erreur traduction Google :",
            error
        );

        res.status(500).json({
            error:
                "Impossible de traduire le texte.",
            details:
                error.message
        });
    }
});

app.post("/api/export-pdf", async (req, res) => {
    try {
        const { text, language = "fr" } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                error: "Aucun texte à exporter."
            });
        }

        const titles = {
            fr: "NaturalReader — Traduction",
            en: "NaturalReader — Translation",
            de: "NaturalReader — Übersetzung",
            ee: "NaturalReader — Traduction en Éwé"
        };

        const languageNames = {
            fr: "Français",
            en: "English",
            de: "Deutsch",
            ee: "Éwé"
        };

        const documentTitle = titles[language] || titles.fr;
        const targetLanguage = languageNames[language] || language;

        const paragraphs = text
            .trim()
            .split(/\r?\n/)
            .map(p => p.trim())
            .filter(Boolean);

        const doc = new PDFDocument({
            size: "A4",
            margin: 0,
            info: {
                Title: documentTitle,
                Author: "NaturalReader",
                Subject: "Document traduit avec NaturalReader",
                Creator: "NaturalReader"
            },
            bufferPages: true
        });

        const chunks = [];

        doc.on("data", chunk => chunks.push(chunk));

        doc.on("end", () => {
            const buffer = Buffer.concat(chunks);

            res.set({
                "Content-Type": "application/pdf",
                "Content-Length": buffer.length,
                "Content-Disposition":
                    'attachment; filename="NaturalReader-traduction.pdf"',
                "Cache-Control": "no-cache"
            });

            res.send(buffer);
        });

        const W = doc.page.width;
        const H = doc.page.height;

        const M = 58;
        const contentWidth = W - (M * 2);

        const BLUE = "#2563eb";
        const DARK_BLUE = "#1e40af";
        const DARK = "#111827";
        const GREY = "#64748b";
        const LIGHT_BLUE = "#eff6ff";
        const BORDER = "#dbeafe";

        function header() {
            doc.rect(0, 0, W, 88)
                .fill(BLUE);

            doc.fillColor("#ffffff")
                .font("Helvetica-Bold")
                .fontSize(23)
                .text("NaturalReader", M, 25);

            doc.fillColor("#dbeafe")
                .font("Helvetica")
                .fontSize(8.5)
                .text("SMART READING & TRANSLATION", M, 57);

            doc.roundedRect(W - M - 145, 27, 145, 30, 7)
                .fill("#ffffff");

            doc.fillColor(DARK_BLUE)
                .font("Helvetica-Bold")
                .fontSize(8)
                .text("TRANSLATED DOCUMENT", W - M - 137, 38, {
                    width: 129,
                    align: "center"
                });
        }

        function footer(pageNumber, totalPages) {
            const y = H - 52;

            doc.rect(0, y, W, 52)
                .fill(DARK_BLUE);

            doc.fillColor("#ffffff")
                .font("Helvetica-Bold")
                .fontSize(8.5)
                .text("NaturalReader", M, y + 20);

            doc.fillColor("#dbeafe")
                .font("Helvetica")
                .fontSize(8)
                .text(
                    `${targetLanguage}  •  Document traduit`,
                    W / 2 - 100,
                    y + 21,
                    {
                        width: 200,
                        align: "center"
                    }
                );

            doc.fillColor("#ffffff")
                .font("Helvetica-Bold")
                .fontSize(8)
                .text(
                    `Page ${pageNumber} / ${totalPages}`,
                    W - M - 100,
                    y + 20,
                    {
                        width: 100,
                        align: "right"
                    }
                );
        }

        header();

        doc.fillColor(DARK)
            .font("Helvetica-Bold")
            .fontSize(22)
            .text(documentTitle, M, 120, {
                width: contentWidth
            });

        doc.fillColor(GREY)
            .font("Helvetica")
            .fontSize(9)
            .text(
                `Langue cible : ${targetLanguage}   •   ${new Date().toLocaleDateString("fr-FR")}`,
                M,
                151,
                {
                    width: contentWidth
                }
            );

        doc.roundedRect(M, 180, contentWidth, 43, 8)
            .fill(LIGHT_BLUE);

        doc.fillColor(DARK_BLUE)
            .font("Helvetica-Bold")
            .fontSize(8.5)
            .text("CONTENU DU DOCUMENT", M + 14, 196);

        let y = 255;

        for (let i = 0; i < paragraphs.length; i++) {
            const paragraph = paragraphs[i];

            const estimatedHeight =
                Math.max(
                    30,
                    Math.ceil(paragraph.length / 85) * 18
                );

            if (y + estimatedHeight > H - 85) {
                doc.addPage();
                header();

                doc.fillColor(GREY)
                    .font("Helvetica")
                    .fontSize(8)
                    .text("SUITE DU DOCUMENT", M, 115);

                y = 150;
            }

            doc.fillColor(DARK)
                .font("Helvetica")
                .fontSize(11.5)
                .text(paragraph, M, y, {
                    width: contentWidth,
                    lineGap: 5,
                    align: "left"
                });

            y = doc.y + 20;
        }

        const pages = doc.bufferedPageRange();

        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);

            footer(i + 1, pages.count);
        }

        doc.end();

    } catch (error) {
        console.error("Erreur export PDF :", error);

        if (!res.headersSent) {
            res.status(500).json({
                error: "Impossible de créer le PDF.",
                details: error.message
            });
        }
    }
});

app.post("/api/export-word", async (req, res) => {
    try {
        const { text, language = "fr" } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                error: "Aucun texte à exporter."
            });
        }

        const titles = {
            fr: "NaturalReader — Traduction",
            en: "NaturalReader — Translation",
            de: "NaturalReader — Übersetzung",
            ee: "NaturalReader — Traduction en Éwé"
        };

        const paragraphs = text
            .trim()
            .split(/\r?\n/)
            .map(paragraph => paragraph.trim())
            .filter(Boolean);

        const children = [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: {
                    after: 300
                },
                children: [
                    new TextRun({
                        text: titles[language] || titles.fr,
                        bold: true,
                        size: 34
                    })
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: {
                    after: 500
                },
                children: [
                    new TextRun({
                        text: "NaturalReader",
                        bold: true,
                        size: 22
                    })
                ]
            })
        ];

        paragraphs.forEach(paragraph => {
            children.push(
                new Paragraph({
                    spacing: {
                        after: 220,
                        line: 300
                    },
                    children: [
                        new TextRun({
                            text: paragraph,
                            size: 24
                        })
                    ]
                })
            );
        });

        const document = new Document({
            creator: "NaturalReader",
            title: titles[language] || titles.fr,
            description: "Document traduit avec NaturalReader",
            sections: [
                {
                    properties: {},
                    children
                }
            ]
        });

        const buffer = await Packer.toBuffer(document);

        res.set({
            "Content-Type":
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Length": buffer.length,
            "Content-Disposition":
                'attachment; filename="NaturalReader-traduction.docx"',
            "Cache-Control": "no-cache"
        });

        res.send(buffer);

    } catch (error) {
        console.error("Erreur export Word :", error);

        if (!res.headersSent) {
            res.status(500).json({
                error: "Impossible de créer le document Word.",
                details: error.message
            });
        }
    }
});

app.post("/api/export-image", async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                error: "Aucun texte à exporter."
            });
        }

        const escapedText = text
            .trim()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");

        const lines = [];
        const maxChars = 70;

        escapedText.split(/\r?\n/).forEach(paragraph => {
            if (!paragraph.trim()) {
                lines.push("");
                return;
            }

            let remaining = paragraph.trim();

            while (remaining.length > maxChars) {
                let cut = remaining.lastIndexOf(" ", maxChars);

                if (cut < 20) {
                    cut = maxChars;
                }

                lines.push(remaining.slice(0, cut));
                remaining = remaining.slice(cut).trimStart();
            }

            lines.push(remaining);
        });

        const lineHeight = 34;
        const top = 100;
        const height = Math.max(
            400,
            top + lines.length * lineHeight + 80
        );

        const svgLines = lines.map((line, index) => {
            const safeLine = line || " ";
            const y = top + index * lineHeight;

            return `
                <text
                    x="70"
                    y="${y}"
                    font-family="Arial, Helvetica, sans-serif"
                    font-size="24"
                    fill="#111827">${safeLine}</text>
            `;
        }).join("");

        const svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="1200"
     height="${height}"
     viewBox="0 0 1200 ${height}">
    <rect width="1200" height="${height}" fill="#ffffff"/>
    <rect x="35" y="35" width="1130" height="${height - 70}"
          rx="24" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
    <text x="70" y="70"
          font-family="Arial, Helvetica, sans-serif"
          font-size="28"
          font-weight="bold"
          fill="#2563eb">NaturalReader</text>
    ${svgLines}
</svg>`;

        const buffer = Buffer.from(svg, "utf8");

        res.set({
            "Content-Type": "image/svg+xml",
            "Content-Length": buffer.length,
            "Content-Disposition":
                'attachment; filename="NaturalReader-traduction.svg"',
            "Cache-Control": "no-cache"
        });

        res.send(buffer);

    } catch (error) {
        console.error("Erreur export image :", error);

        if (!res.headersSent) {
            res.status(500).json({
                error: "Impossible de créer l'image.",
                details: error.message
            });
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`NaturalReader lancÃ© sur le port ${PORT}`);
});


const multer = require("multer");
const Tesseract = require("tesseract.js");
const pdfParse = require("pdf-parse");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 15 * 1024 * 1024
    }
});

app.post("/api/extract-document", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "Aucun fichier n'a été envoyé."
            });
        }

        const mimeType = req.file.mimetype || "";

        if (mimeType.startsWith("image/")) {
            const result = await Tesseract.recognize(
                req.file.buffer,
                "eng+fra+deu",
                {
                    logger: info => {
                        if (info.status) {
                            console.log(
                                `OCR : ${info.status} ${Math.round((info.progress || 0) * 100)}%`
                            );
                        }
                    }
                }
            );

            const text = (result.data.text || "").trim();

            if (!text) {
                return res.status(422).json({
                    error: "Aucun texte lisible n'a été trouvé dans l'image."
                });
            }

            return res.json({
                type: "image",
                text
            });
        }

        if (mimeType === "application/pdf") {
            const result = await pdfParse(req.file.buffer);
            const text = (result.text || "").trim();

            if (!text) {
                return res.status(422).json({
                    error: "Aucun texte exploitable n'a été trouvé dans le PDF."
                });
            }

            return res.json({
                type: "pdf",
                text
            });
        }

        return res.status(400).json({
            error: "Format non pris en charge. Utilisez une photo ou un PDF."
        });

    } catch (error) {
        console.error("Erreur extraction document :", error);

        res.status(500).json({
            error: "Impossible d'extraire le texte du document.",
            details: error.message
        });
    }
});

