const ACTION_PATTERNS = [
    {
        action: "walking",
        words: [
            "walk", "walks", "walking",
            "marche", "marcher", "marche",
            "geht", "gehen", "läuft", "laufen"
        ]
    },
    {
        action: "running",
        words: [
            "run", "runs", "running",
            "court", "courir", "cours",
            "rennt", "rennen", "läuft"
        ]
    },
    {
        action: "flying",
        words: [
            "fly", "flies", "flying",
            "vole", "volent", "voler",
            "fliegt", "fliegen"
        ]
    },
    {
        action: "driving",
        words: [
            "drive", "drives", "driving",
            "conduit", "conduire",
            "fährt", "fahren"
        ]
    },
    {
        action: "rising",
        words: [
            "rise", "rises", "rising",
            "se lève", "lever",
            "steigt", "aufgehen"
        ]
    },
    {
        action: "falling",
        words: [
            "fall", "falls", "falling",
            "tombe", "tomber",
            "fällt", "fallen"
        ]
    },
    {
        action: "speaking",
        words: [
            "speak", "speaks", "speaking",
            "talk", "talks", "talking",
            "parle", "parler",
            "spricht", "sprechen"
        ]
    },
    {
        action: "dancing",
        words: [
            "dance", "dances", "dancing",
            "danse", "danser",
            "tanzt", "tanzen"
        ]
    },
    {
        action: "swimming",
        words: [
            "swim", "swims", "swimming",
            "nage", "nager",
            "schwimmt", "schwimmen"
        ]
    },
    {
        action: "working",
        words: [
            "work", "works", "working",
            "travaille", "travailler",
            "arbeitet", "arbeiten"
        ]
    }
];

const SUBJECT_PATTERNS = [
    {
        subject: "person",
        words: [
            "person", "man", "woman",
            "boy", "girl", "child",
            "people", "human",
            "homme", "femme", "enfant",
            "personne", "gens",
            "mann", "frau", "kind", "menschen"
        ]
    },
    {
        subject: "birds",
        words: [
            "bird", "birds",
            "oiseau", "oiseaux",
            "vogel", "vögel"
        ]
    },
    {
        subject: "car",
        words: [
            "car", "cars", "vehicle",
            "voiture", "véhicule",
            "auto", "fahrzeug"
        ]
    },
    {
        subject: "ocean",
        words: [
            "ocean", "sea", "water",
            "mer", "océan", "eau",
            "meer", "ozean", "wasser"
        ]
    },
    {
        subject: "forest",
        words: [
            "forest", "woods", "tree", "trees",
            "forêt", "bois", "arbre", "arbres",
            "wald", "baum", "bäume"
        ]
    },
    {
        subject: "sun",
        words: [
            "sun", "sunrise", "sunset",
            "soleil", "lever", "coucher",
            "sonne", "sonnenaufgang", "sonnenuntergang"
        ]
    }
];

const LOCATION_PATTERNS = [
    {
        location: "city",
        words: [
            "city", "street", "town",
            "ville", "rue", "centre",
            "stadt", "straße"
        ]
    },
    {
        location: "beach",
        words: [
            "beach", "shore", "coast",
            "plage", "côte", "rivage",
            "strand", "küste"
        ]
    },
    {
        location: "forest",
        words: [
            "forest", "woods",
            "forêt", "bois",
            "wald"
        ]
    },
    {
        location: "ocean",
        words: [
            "ocean", "sea", "river", "lake",
            "mer", "rivière", "lac",
            "meer", "fluss", "see"
        ]
    },
    {
        location: "home",
        words: [
            "home", "house", "room",
            "maison", "maison", "pièce",
            "haus", "zimmer"
        ]
    }
];

function normalize(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function findPattern(text, patterns) {
    const normalized = normalize(text);

    for (const pattern of patterns) {
        for (const word of pattern.words) {
            const candidate = normalize(word);

            if (
                normalized.includes(
                    candidate
                )
            ) {
                return pattern[
                    Object.keys(pattern)
                        .find(key => key !== "words")
                ];
            }
        }
    }

    return null;
}

function detectAction(text) {
    return (
        findPattern(
            text,
            ACTION_PATTERNS
        ) ||
        "static"
    );
}

function detectSubject(text) {
    return (
        findPattern(
            text,
            SUBJECT_PATTERNS
        ) ||
        "scene"
    );
}

function detectLocation(text) {
    return (
        findPattern(
            text,
            LOCATION_PATTERNS
        ) ||
        "environment"
    );
}

function extractKeywords(text) {
    return String(text || "")
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .split(/\s+/)
        .map(word => word.trim())
        .filter(word => word.length >= 4)
        .slice(0, 8);
}

function buildVisualPrompt(
    text,
    subject,
    location,
    action
) {
    const actionDescriptions = {
        walking:
            "walking naturally, candid movement",
        running:
            "running with visible motion",
        flying:
            "flying through the air",
        driving:
            "driving naturally",
        rising:
            "rising into the sky",
        falling:
            "falling through the air",
        speaking:
            "speaking naturally",
        dancing:
            "dancing with movement",
        swimming:
            "swimming through water",
        working:
            "working naturally",
        static:
            "natural scene with subtle environmental movement"
    };

    const movement =
        actionDescriptions[action] ||
        actionDescriptions.static;

    return [
        text,
        `subject: ${subject}`,
        `location: ${location}`,
        `action: ${movement}`,
        "realistic photography",
        "cinematic composition",
        "natural lighting",
        "documentary realism"
    ].join(", ");
}

function analyzeSentence(
    sentence,
    index
) {
    const subject =
        detectSubject(sentence);

    const location =
        detectLocation(sentence);

    const action =
        detectAction(sentence);

    const keywords =
        extractKeywords(sentence);

    return {
        index,
        narration: sentence,
        subject,
        location,
        action,
        keywords,
        visualPrompt:
            buildVisualPrompt(
                sentence,
                subject,
                location,
                action
            )
    };
}

function splitSentences(text) {
    return String(text || "")
        .replace(/\r\n/g, "\n")
        .split(
            /(?<=[.!?…。！？])\s+/
        )
        .map(value => value.trim())
        .filter(Boolean);
}

async function analyzeText(
    text,
    mode = "intelligent"
) {
    const sentences =
        splitSentences(text);

    return {
        mode,
        sceneCount: sentences.length,
        scenes: sentences.map(
            (sentence, index) =>
                analyzeSentence(
                    sentence,
                    index
                )
        )
    };
}

module.exports = {
    analyzeText,
    detectAction,
    detectSubject,
    detectLocation
};

if (require.main === module) {
    const text =
        process.argv
            .slice(2)
            .join(" ")
            .trim();

    if (!text) {
        console.error(
            "Texte requis."
        );
        process.exit(1);
    }

    analyzeText(text)
        .then(result => {
            console.log(
                JSON.stringify(
                    result,
                    null,
                    2
                )
            );
        });
}
