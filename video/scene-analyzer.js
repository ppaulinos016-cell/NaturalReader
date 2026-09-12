const ACTION_WORDS = [
    "marche","marcher","découvre","découvrir","souffle","souffler",
    "se couche","se coucher","court","courir","vole","voler","nage","nager",
    "grimpe","grimper","tombe","tomber","fuit","fuir","cherche","chercher",
    "regarde","regarder","voit","voir","rencontre","rencontrer",
    "parle","parler","dit","dire","écoute","écouter","ouvre","ouvrir",
    "ferme","fermer","prend","prendre","porte","porter","pose","poser",
    "entre","entrer","sort","sortir","avance","avancer","recule","reculer",
    "travaille","travailler","danse","danser","chante","chanter",
    "pleure","pleurer","rit","rire","sourit","sourire","crie","crier",
    "écrit","écrire","lit","lire","mange","manger","boit","boire"
];

const SUBJECT_WORDS = [
    "homme","femme","enfant","garçon","fille","personne","personnage",
    "voyageur","voyageuse","roi","reine","soldat","guerrier","guerrière",
    "père","mère","ami","amie","oiseau","cheval","chien","chat","animal",
    "famille","foule","man","woman","child","boy","girl","person",
    "king","queen","soldier","warrior","bird","horse","dog","cat",
    "family","people"
];

const LOCATION_WORDS = [
    "maison","chambre","pièce","village","ville","rue","forêt","bois",
    "montagne","colline","vallée","rivière","lac","mer","océan","plage",
    "désert","jardin","champ","ferme","école","église","marché","palais",
    "château","route","pont","grotte","île","city","street","forest",
    "mountain","river","lake","sea","ocean","beach","desert","garden",
    "field","school","market","palace","castle","road","bridge","cave",
    "island"
];

const OBJECT_WORDS = [
    "livre","lettre","clé","épée","bâton","sac","valise","voiture",
    "bateau","navire","porte","fenêtre","lampe","bougie","table","chaise",
    "arbre","fleur","feu","téléphone","photo","carte","couronne","trésor",
    "argent","book","letter","key","sword","stick","bag","car","boat",
    "ship","door","window","lamp","candle","table","chair","tree",
    "flower","fire","phone","map","crown","treasure","gold"
];

const WEATHER_WORDS = [
    "pluie","pluvieux","orage","tempête","neige","neigeux","vent","venteux",
    "soleil","ensoleillé","nuage","nuageux","brouillard","brume","éclair",
    "tonnerre","rain","storm","snow","wind","sun","sunny","cloud","cloudy",
    "fog","mist","thunder"
];

const TIME_WORDS = [
    "matin","aube","midi","après-midi","soir","coucher","nuit","minuit",
    "crépuscule","jour","hier","aujourd'hui","demain","morning","dawn",
    "noon","afternoon","evening","sunset","night","midnight","twilight",
    "day","yesterday","today","tomorrow"
];

const ERA_WORDS = [
    "ancien","ancienne","antique","médiéval","médiévale","royaume",
    "empire","tribu","préhistoire","historique","futur","futuriste",
    "technologique","moderne","contemporain","ancient","medieval",
    "kingdom","empire","tribe","prehistoric","historical","future",
    "futuristic","modern","contemporary"
];

function normalize(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function tokenize(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .filter(Boolean);
}

function findWords(text, dictionary) {
    const source = String(text || "").toLowerCase();
    const tokens = tokenize(text);

    return unique(
        dictionary.filter(word => {
            const candidate = String(word).toLowerCase();

            if (candidate.includes(" ")) {
                return source.includes(candidate);
            }

            return tokens.includes(candidate);
        })
    );
}

function inferAction(text) {
    const found = findWords(text, ACTION_WORDS);

    return found.length
        ? found.slice(0, 3).join(", ")
        : "natural movement appropriate to the story";
}

function inferCharacters(text) {
    const found = findWords(text, SUBJECT_WORDS);

    return found.length
        ? found.slice(0, 5)
        : ["fictional story character"];
}

function inferLocations(text) {
    const found = findWords(text, LOCATION_WORDS);

    return found.length
        ? found.slice(0, 4)
        : ["story-appropriate environment"];
}

function inferObjects(text) {
    return findWords(text, OBJECT_WORDS).slice(0, 6);
}

function inferWeather(text) {
    const found = findWords(text, WEATHER_WORDS);

    return found.length
        ? found.slice(0, 3)
        : ["natural weather consistent with the scene"];
}

function inferTime(text) {
    const found = findWords(text, TIME_WORDS);

    return found.length
        ? found.slice(0, 3)
        : ["time of day appropriate to the narrative"];
}

function inferEra(text) {
    const found = findWords(text, ERA_WORDS);

    return found.length
        ? found.slice(0, 3)
        : ["era appropriate to the story"];
}

function inferAtmosphere(text) {
    const source = normalize(text);

    if (/peur|danger|menace|attaque|guerre|fear|danger|attack|war/.test(source)) {
        return "dramatic, tense, mysterious atmosphere";
    }

    if (/joie|heureux|bonheur|rire|fete|happy|joy|laugh|celebration/.test(source)) {
        return "warm, joyful, lively atmosphere";
    }

    if (/triste|pleure|mort|solitude|sad|cry|death|alone/.test(source)) {
        return "quiet, emotional, melancholic atmosphere";
    }

    if (/amour|aime|love|tendre|tendresse/.test(source)) {
        return "gentle, warm, tender atmosphere";
    }

    if (/mystérieux|mystere|mystery|mysterious/.test(source)) {
        return "mysterious, magical, cinematic atmosphere";
    }

    return "natural cinematic atmosphere matching the narrative";
}

function extractKeywords(text) {
    return unique(
        String(text || "")
            .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
            .split(/\s+/)
            .map(word => word.trim())
            .filter(word => word.length >= 4)
    ).slice(0, 12);
}

function buildVisualPrompt(data) {
    return [
        data.narration,
        `fictional characters: ${data.characters.join(", ")}`,
        `environment: ${data.locations.join(", ")}`,
        `actions: ${data.actions.join(", ")}`,
        data.objects.length
            ? `important objects: ${data.objects.join(", ")}`
            : "",
        `weather: ${data.weather.join(", ")}`,
        `time: ${data.time.join(", ")}`,
        `era: ${data.era.join(", ")}`,
        `atmosphere: ${data.atmosphere}`,
        `story progression: ${data.progression}`,
        "hand-drawn 2D animated film aesthetic",
        "Ghibli-inspired Japanese animation aesthetic",
        "soft painterly backgrounds",
        "expressive fictional characters",
        "cinematic composition",
        "warm detailed lighting",
        "visible character movement",
        "visible environmental movement",
        "cinematic camera movement",
        "no photorealistic faces",
        "no real person likeness",
        "coherent continuity with previous scene"
    ].filter(Boolean).join(", ");
}

function splitSentences(text) {
    return String(text || "")
        .replace(/\r\n/g, "\n")
        .split(/(?<=[.!?…。！？])\s+/)
        .map(value => value.trim())
        .filter(Boolean);
}

function analyzeSentence(sentence, index, total, previousCharacters = []) {
    const detectedCharacters = inferCharacters(sentence);
    const characters =
        detectedCharacters[0] === "fictional story character" && previousCharacters.length
            ? previousCharacters
            : detectedCharacters;

    const locations = inferLocations(sentence);
    const actions = [inferAction(sentence)];
    const objects = inferObjects(sentence);
    const weather = inferWeather(sentence);
    const time = inferTime(sentence);
    const era = inferEra(sentence);
    const atmosphere = inferAtmosphere(sentence);

    let progression = "continuation of the narrative";

    if (index === 0) {
        progression = "opening of the story";
    } else if (index === total - 1) {
        progression = "resolution or closing moment";
    } else if (index < total / 2) {
        progression = "development of the story";
    } else {
        progression = "escalation or transition toward the conclusion";
    }

    const data = {
        index,
        narration: sentence,
        characters,
        locations,
        actions,
        objects,
        weather,
        time,
        era,
        atmosphere,
        progression
    };

    return {
        ...data,
        subject: characters[0],
        location: locations[0],
        action: actions[0],
        keywords: extractKeywords(sentence),
        visualPrompt: buildVisualPrompt(data)
    };
}

async function analyzeText(text, mode = "intelligent") {
    const sentences = splitSentences(text);
    let previousCharacters = [];

    const scenes = sentences.map((sentence, index) => {
        const scene = analyzeSentence(
            sentence,
            index,
            sentences.length,
            previousCharacters
        );

        if (
            scene.characters.length &&
            scene.characters[0] !== "fictional story character"
        ) {
            previousCharacters = scene.characters;
        }

        return scene;
    });

    return {
        mode,
        sceneCount: scenes.length,
        visualDirection: "animated-narrative",
        style: "Ghibli-inspired Japanese-animation",
        scenes
    };
}

module.exports = {
    analyzeText,
    detectAction: inferAction,
    detectSubject: text => inferCharacters(text)[0],
    detectLocation: text => inferLocations(text)[0],
    inferCharacters,
    inferLocations,
    inferObjects,
    inferWeather,
    inferTime,
    inferEra,
    inferAtmosphere
};
