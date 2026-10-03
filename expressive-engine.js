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
        rateMin: 0.98,
        rateMax: 1.16,
        pitchMin: 2,
        pitchMax: 9
    },
    joyful: {
        rateMin: 1.00,
        rateMax: 1.24,
        pitchMin: 4,
        pitchMax: 14
    },
    sad: {
        rateMin: 0.72,
        rateMax: 0.90,
        pitchMin: -14,
        pitchMax: -4
    },
    calm: {
        rateMin: 0.72,
        rateMax: 0.88,
        pitchMin: -6,
        pitchMax: 1
    },
    poetic: {
        rateMin: 0.76,
        rateMax: 1.02,
        pitchMin: -5,
        pitchMax: 9
    },
    narrative: {
        rateMin: 0.88,
        rateMax: 1.08,
        pitchMin: -4,
        pitchMax: 8
    },
    dramatic: {
        rateMin: 0.70,
        rateMax: 1.24,
        pitchMin: -12,
        pitchMax: 15
    },
    energetic: {
        rateMin: 1.04,
        rateMax: 1.28,
        pitchMin: 4,
        pitchMax: 13
    },
    serious: {
        rateMin: 0.78,
        rateMax: 0.96,
        pitchMin: -8,
        pitchMax: 0
    },
    enthusiastic: {
        rateMin: 1.04,
        rateMax: 1.30,
        pitchMin: 5,
        pitchMax: 15
    },
    mysterious: {
        rateMin: 0.70,
        rateMax: 0.92,
        pitchMin: -11,
        pitchMax: -1
    },
    educational: {
        rateMin: 0.82,
        rateMax: 0.98,
        pitchMin: -3,
        pitchMax: 5
    },
    news: {
        rateMin: 0.90,
        rateMax: 1.06,
        pitchMin: -2,
        pitchMax: 5
    },
    story: {
        rateMin: 0.78,
        rateMax: 1.14,
        pitchMin: -5,
        pitchMax: 10
    },
    speech: {
        rateMin: 0.84,
        rateMax: 1.16,
        pitchMin: -4,
        pitchMax: 9
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

const INTELLIGENT_MODE_WORDS = {
    joyful: [
        "heureux", "heureuse", "joie", "joyeux", "joyeuse",
        "bonheur", "magnifique", "merveilleux", "merveilleuse",
        "bravo", "félicitations", "excellent", "excellente",
        "fantastique", "super", "formidable",
        "happy", "happiness", "joy", "joyful", "wonderful",
        "great", "amazing", "excellent", "congratulations",
        "glücklich", "freude", "wunderbar", "ausgezeichnet"
    ],
    sad: [
        "triste", "tristesse", "douleur", "pleurer", "pleurs",
        "deuil", "perdu", "perte", "regret", "déçu", "déception",
        "malheur", "solitude",
        "sad", "sadness", "pain", "cry", "loss", "regret",
        "disappointed", "lonely",
        "traurig", "traurigkeit", "schmerz", "verlust"
    ],
    calm: [
        "calme", "calmement", "tranquille", "tranquillement",
        "paix", "paisible", "doucement", "respirer", "respirez",
        "relax", "relaxing", "peace", "peaceful", "slowly",
        "ruhig", "ruhe", "friedlich"
    ],
    poetic: [
        "poème", "poétique", "lumière", "danse", "rêve", "rêver",
        "étoile", "ciel", "brise", "silence", "beauté",
        "beautiful", "dream", "dreaming", "star", "sky",
        "poem", "poetic", "breeze", "beauty"
    ],
    dramatic: [
        "soudain", "soudainement", "danger", "terrible", "terrifiant",
        "crise", "urgence", "catastrophe", "menace", "secret",
        "mystère", "inattendu", "impossible",
        "suddenly", "danger", "terrible", "terrifying",
        "crisis", "emergency", "disaster", "threat", "secret",
        "mystery", "unexpected", "impossible"
    ],
    energetic: [
        "allez", "avance", "avançons", "vite", "action", "agir",
        "gagner", "victoire", "combat", "force", "puissance",
        "go", "move", "action", "act", "win", "victory",
        "fight", "power", "energy"
    ],
    serious: [
        "important", "attention", "avertissement", "responsabilité",
        "décision", "obligation", "risque", "problème", "devoir",
        "important", "warning", "responsibility", "decision",
        "obligation", "risk", "problem", "must",
        "wichtig", "achtung", "verantwortung", "entscheidung", "pflicht"
    ],
    enthusiastic: [
        "fantastique", "incroyable", "extraordinaire", "génial",
        "super", "hourra", "bravo", "félicitations",
        "fantastic", "incredible", "extraordinary", "awesome",
        "amazing", "hurray", "bravo", "congratulations"
    ],
    mysterious: [
        "mystère", "mystérieux", "mystérieuse", "secret", "ombre",
        "étrange", "inconnu", "inconnue", "énigme", "disparu",
        "disparue", "silence", "secret", "mystery", "mysterious",
        "shadow", "strange", "unknown", "riddle", "disappeared"
    ],
    educational: [
        "apprendre", "apprenons", "leçon", "règle", "exemple",
        "question", "réponse", "exercice", "explication",
        "observer", "comparez", "retenez", "souvenez",
        "learn", "lesson", "rule", "example", "question",
        "answer", "exercise", "explanation", "observe", "remember",
        "lernen", "regel", "beispiel", "frage", "antwort"
    ],
    news: [
        "aujourd'hui", "ce matin", "ce soir", "annonce", "annoncé",
        "autorités", "gouvernement", "selon", "rapport", "information",
        "dernier", "dernière", "actualités",
        "today", "this morning", "announcement", "authorities",
        "government", "according", "report", "information", "latest",
        "heute", "nachrichten", "bericht", "regierung"
    ],
    story: [
        "il était une fois", "un jour", "dans un petit village",
        "autrefois", "jadis", "princesse", "prince", "roi", "forêt",
        "conte", "aventure",
        "once upon a time", "one day", "long ago", "princess",
        "prince", "king", "forest", "fairy tale", "adventure"
    ],
    speech: [
        "mesdames", "messieurs", "chers amis", "citoyens",
        "nous sommes réunis", "je vous remercie", "ensemble",
        "mesdames et messieurs", "ladies", "gentlemen",
        "dear friends", "citizens", "we are gathered",
        "thank you", "together"
    ],
    narrative: [
        "puis", "ensuite", "alors", "pendant ce temps", "plus tard",
        "finalement", "ce jour-là", "le lendemain",
        "then", "next", "later", "meanwhile", "finally",
        "the next day"
    ]
};

function resolveIntelligentMode(text) {
    const normalized = text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const scores = {};

    const addScore = (mode, value) => {
        scores[mode] = (scores[mode] || 0) + value;
    };

    const countCue = (cues) =>
        cues.reduce(
            (count, cue) =>
                count +
                (normalized.includes(cue) ? 1 : 0),
            0
        );

    const semanticModes = Object.keys(
        INTELLIGENT_MODE_WORDS
    );

    for (const mode of semanticModes) {
        const hits =
            countMatches(
                text,
                INTELLIGENT_MODE_WORDS[mode]
            );

        if (hits > 0) {
            addScore(
                mode,
                Math.min(hits * 2.0, 8)
            );
        }
    }

    const positive =
        countMatches(text, POSITIVE_WORDS);

    const negative =
        countMatches(text, NEGATIVE_WORDS);

    const important =
        countMatches(text, IMPORTANT_WORDS);

    const exclamations =
        (text.match(/!/g) || []).length;

    const questions =
        (text.match(/\?/g) || []).length;

    const ellipses =
        (text.match(/…|\.{3}/g) || []).length;

    /*
     * Les mots et expressions portent maintenant
     * beaucoup plus de poids que la ponctuation.
     */

    addScore(
        "joyful",
        Math.min(positive * 1.8, 5)
    );

    addScore(
        "enthusiastic",
        Math.min(positive * 1.2, 4)
    );

    addScore(
        "sad",
        Math.min(negative * 2.0, 6)
    );

    addScore(
        "serious",
        Math.min(important * 2.0, 5)
    );

    const calmCues = [
        "calme",
        "calmement",
        "tranquille",
        "tranquillement",
        "paisible",
        "paix",
        "doucement",
        "respirez",
        "respirer",
        "relax",
        "peace",
        "peaceful",
        "ruhig"
    ];

    const poeticCues = [
        "poeme",
        "poetique",
        "lumiere",
        "etoile",
        "ciel",
        "reve",
        "rever",
        "brise",
        "silence",
        "danse",
        "beauty",
        "dream",
        "star",
        "sky"
    ];

    const mysteryCues = [
        "mystere",
        "mysterieux",
        "mysterieuse",
        "secret",
        "ombre",
        "etrange",
        "inconnu",
        "inconnue",
        "enigme",
        "disparu",
        "disparue",
        "mystery",
        "shadow",
        "unknown"
    ];

    const dramaticCues = [
        "soudain",
        "soudainement",
        "danger",
        "urgence",
        "terrible",
        "terrifiant",
        "catastrophe",
        "menace",
        "crise",
        "inattendu",
        "inattendue",
        "suddenly",
        "danger",
        "emergency",
        "threat",
        "disaster"
    ];

    const energeticCues = [
        "allez",
        "avance",
        "avanc?ons",
        "agir",
        "action",
        "gagner",
        "gagnons",
        "victoire",
        "force",
        "puissance",
        "go",
        "move",
        "act",
        "win",
        "victory",
        "power"
    ];

    const educationalCues = [
        "apprendre",
        "apprenons",
        "lecon",
        "regle",
        "exemple",
        "expliquer",
        "expliquez",
        "explication",
        "observer",
        "comparez",
        "retenez",
        "souvenez",
        "parce que",
        "cest a dire",
        "cela signifie",
        "how",
        "why",
        "learn",
        "lesson",
        "example",
        "explain"
    ];

    const newsCues = [
        "aujourd'hui",
        "ce matin",
        "ce soir",
        "annonce",
        "annonce",
        "autorites",
        "gouvernement",
        "selon",
        "rapport",
        "informations",
        "actualites",
        "today",
        "this morning",
        "authorities",
        "government",
        "according to",
        "report",
        "latest"
    ];

    const storyCues = [
        "il etait une fois",
        "un jour",
        "autrefois",
        "jadis",
        "dans un petit village",
        "princesse",
        "prince",
        "roi",
        "reine",
        "foret",
        "aventure",
        "once upon a time",
        "one day",
        "long ago",
        "princess",
        "prince",
        "king",
        "forest",
        "adventure"
    ];

    const speechCues = [
        "mesdames",
        "messieurs",
        "chers amis",
        "citoyens",
        "ensemble",
        "nous sommes reunis",
        "je vous remercie",
        "ladies and gentlemen",
        "dear friends",
        "citizens",
        "we are gathered",
        "thank you"
    ];

    const narrativeCues = [
        "puis",
        "ensuite",
        "alors",
        "pendant ce temps",
        "plus tard",
        "finalement",
        "ce jour la",
        "le lendemain",
        "then",
        "next",
        "later",
        "meanwhile",
        "finally"
    ];

    addScore(
        "calm",
        Math.min(countCue(calmCues) * 2.4, 7)
    );

    addScore(
        "poetic",
        Math.min(countCue(poeticCues) * 2.2, 7)
    );

    addScore(
        "mysterious",
        Math.min(countCue(mysteryCues) * 2.4, 7)
    );

    addScore(
        "dramatic",
        Math.min(countCue(dramaticCues) * 2.3, 8)
    );

    addScore(
        "energetic",
        Math.min(countCue(energeticCues) * 2.2, 7)
    );

    addScore(
        "educational",
        Math.min(countCue(educationalCues) * 2.3, 8)
    );

    addScore(
        "news",
        Math.min(countCue(newsCues) * 2.3, 8)
    );

    addScore(
        "story",
        Math.min(countCue(storyCues) * 2.4, 8)
    );

    addScore(
        "speech",
        Math.min(countCue(speechCues) * 2.4, 8)
    );

    addScore(
        "narrative",
        Math.min(countCue(narrativeCues) * 2.0, 6)
    );

    /*
     * Les indices de structure compl?tent l'analyse s?mantique.
     */

    if (
        /^(nous|vous|mesdames|messieurs|chers|citoyens)\b/.test(
            normalized
        )
    ) {
        addScore("speech", 4);
    }

    if (
        /^(il|elle|ils|elles)\b/.test(normalized)
    ) {
        addScore("narrative", 1.5);
    }

    if (
        /^(attention|ecoutez|souvenez|retenez|regardez)\b/.test(
            normalized
        )
    ) {
        addScore("educational", 3);
        addScore("serious", 1.5);
    }

    if (
        /(nous devons|il faut|vous devez|doit absolument|obligation|responsabilite)/.test(
            normalized
        )
    ) {
        addScore("serious", 3);
    }

    if (
        /(incroyable|extraordinaire|fantastique|merveilleux|magnifique|bravo|reussi|reussite)/.test(
            normalized
        )
    ) {
        addScore("enthusiastic", 3);
        addScore("joyful", 2);
    }

    if (
        /(malheureusement|heureusement|pourtant|cependant|mais)/.test(
            normalized
        )
    ) {
        addScore("dramatic", 1.2);
        addScore("narrative", 0.8);
    }

    if (
        /(peur|terreur|danger|menace|urgence|mort|perte|tragique)/.test(
            normalized
        )
    ) {
        addScore("dramatic", 3);
    }

    /*
     * La ponctuation ne d?cide plus seule du ton.
     * Elle ne sert qu'? renforcer l?g?rement un signal d?j? d?tect?.
     */

    if (questions > 0) {
        addScore("educational", 0.8);
        addScore("mysterious", 0.7);
    }

    if (exclamations > 0) {
        addScore("enthusiastic", 0.8);
        addScore("joyful", 0.5);
        addScore("dramatic", 0.5);
    }

    if (ellipses > 0) {
        addScore("mysterious", 0.7);
        addScore("poetic", 0.5);
    }

    if (Object.keys(scores).length === 0) {
        return "narrative";
    }

    let bestMode = "narrative";
    let bestScore = scores.narrative || 0;

    for (const mode of Object.keys(scores)) {
        if (scores[mode] > bestScore) {
            bestMode = mode;
            bestScore = scores[mode];
        }
    }

    if (bestScore < 1.6) {
        return "narrative";
    }

    return bestMode;
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

    let intensity = 0.34;

    /*
     * L'intensit? d?pend d'abord du contenu s?mantique.
     * La ponctuation n'est plus qu'un l?ger renforcement.
     */

    if (mode === "intelligent") {
        const modeWords =
            INTELLIGENT_MODE_WORDS[activeMode] || [];

        const semanticHits =
            countMatches(text, modeWords);

        intensity += Math.min(
            semanticHits * 0.10,
            0.35
        );
    }

    intensity += Math.min(
        positive * 0.05,
        0.15
    );

    intensity -= Math.min(
        negative * 0.04,
        0.12
    );

    intensity += Math.min(
        important * 0.07,
        0.14
    );

    intensity += Math.min(
        exclamations * 0.03,
        0.09
    );

    intensity += Math.min(
        questions * 0.025,
        0.05
    );

    if (text.length > 120) {
        intensity -= 0.025;
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
        intensity += 0.025;
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

            const generated = [];

            for (
                let index = 0;
                index < segments.length;
                index++
            ) {
                const segment =
                    segments[index];

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

                const audioPath =
                    path.join(
                        tempRoot,
                        `segment-${String(index).padStart(4, "0")}.mp3`
                    );

                const silencePath =
                    path.join(
                        tempRoot,
                        `silence-${String(index).padStart(4, "0")}.mp3`
                    );

                const tts =
                    new EdgeTTS({
                        voice: microsoftVoice,
                        outputFormat:
                            "audio-24khz-48kbitrate-mono-mp3",
                        rate,
                        pitch:
                            analysis.pitch,
                        volume: "default"
                    });

                console.log(
                    `TTS expressif : segment ${index + 1}/${segments.length}`
                );

                await tts.ttsPromise(
                    segment,
                    audioPath
                );

                await createSilence(
                    silencePath,
                    analysis.pauseAfterMs
                );

                generated.push({
                    index,
                    audioPath,
                    silencePath
                });
            }
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

















