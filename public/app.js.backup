const textInput = document.getElementById("text");
const languageSelect = document.getElementById("language");
const voiceSelect = document.getElementById("voice");
const speedSelect = document.getElementById("speed");

const readButton = document.getElementById("readButton");
const pauseButton = document.getElementById("pauseButton");
const stopButton = document.getElementById("stopButton");

const cleanButton = document.getElementById("cleanButton");
const detectButton = document.getElementById("detectButton");
const clearButton = document.getElementById("clearButton");

const readingStatus = document.getElementById("readingStatus");
const characterCount = document.getElementById("characterCount");
const wordCount = document.getElementById("wordCount");

let voices = [];
let currentUtterance = null;

function getText() {
    return textInput.value.replace(/\r\n/g, "\n");
}

function getWordCount(text) {
    const cleaned = text.trim();
    return cleaned ? cleaned.split(/\s+/).length : 0;
}

function updateCounters() {
    const text = getText();
    const characters = text.length;
    const words = getWordCount(text);

    characterCount.textContent =
        `${characters} caractère${characters !== 1 ? "s" : ""}`;

    wordCount.textContent =
        `${words} mot${words !== 1 ? "s" : ""}`;
}

function cleanText() {
    let text = getText();

    text = text
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ ]+\n/g, "\n")
        .replace(/\n[ ]+/g, "\n")
        .trim();

    textInput.value = text;
    updateCounters();

    readingStatus.textContent = text
        ? "✨ Texte nettoyé et prêt à être lu"
        : "Aucun texte à nettoyer";
}

function clearText() {
    speechSynthesis.cancel();
    textInput.value = "";
    updateCounters();
    readingStatus.textContent = "Prêt à lire";
}

function estimateReadingTime() {
    const words = getWordCount(getText());

    if (!words) return 0;

    const rate = Number(speedSelect.value);
    const wordsPerMinute = 150 * rate;

    return Math.ceil((words / wordsPerMinute) * 60);
}

function formatDuration(seconds) {
    if (seconds < 60) {
        return `${seconds} seconde${seconds !== 1 ? "s" : ""}`;
    }

    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;

    return remaining === 0
        ? `${minutes} minute${minutes !== 1 ? "s" : ""}`
        : `${minutes} min ${remaining} s`;
}

function detectLanguage() {
    const text = ` ${getText().toLowerCase()} `;

    if (!text.trim()) {
        readingStatus.textContent = "Aucun texte à analyser.";
        return;
    }

    const dictionaries = {
        "fr-FR": [
            " le ", " la ", " les ", " des ", " une ",
            " est ", " avec ", " pour ", " dans ", " que ",
            " bonjour ", " merci ", " vous "
        ],
        "en-GB": [
            " the ", " a ", " an ", " is ", " are ",
            " with ", " for ", " this ", " that ",
            " hello ", " thank ", " you "
        ],
        "de-DE": [
            " der ", " die ", " das ", " ein ",
            " ist ", " und ", " mit ", " für ",
            " ich ", " nicht ", " hallo "
        ]
    };

    const scores = {};

    for (const language in dictionaries) {
        scores[language] = dictionaries[language]
            .filter(word => text.includes(word))
            .length;
    }

    const detected = Object.keys(scores)
        .sort((a, b) => scores[b] - scores[a])[0];

    if (scores[detected] === 0) {
        readingStatus.textContent =
            "Langue non déterminée. Choisissez-la manuellement.";
        return;
    }

    languageSelect.value = detected;
    loadVoices();

    const names = {
        "fr-FR": "Français",
        "en-GB": "English",
        "de-DE": "Deutsch"
    };

    readingStatus.textContent =
        `🌍 Langue détectée : ${names[detected]}`;
}

function loadVoices() {
    voices = speechSynthesis.getVoices();

    const selectedLanguage = languageSelect.value;

    const allowedVoices = {
        "fr-FR": [
            "Microsoft Denise Online (Natural)",
            "Microsoft Eloise Online (Natural)",
            "Microsoft Jean Online (Natural)"
        ],
        "en-GB": [
            "Microsoft Maisie Online (Natural)",
            "Microsoft Ezinne Online (Natural)"
        ],
        "de-DE": [
            "Microsoft Seraphina Mehrsprachig Online (Natural)",
            "Microsoft Conrad Online (Natural)"
        ]
    };

    const allowedNames = allowedVoices[selectedLanguage] || [];

    const matchingVoices = voices.filter(voice => {
        const name = voice.name.toLowerCase();

        return allowedNames.some(allowedName =>
            name.includes(allowedName.toLowerCase())
        );
    });

    voiceSelect.innerHTML = "";

    if (!matchingVoices.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Aucune voix Windows disponible";
        voiceSelect.appendChild(option);
        return;
    }

    matchingVoices.forEach(voice => {
        const option = document.createElement("option");

        option.value = voices.indexOf(voice);

        option.textContent = voice.name;

        voiceSelect.appendChild(option);
    });
}

function speak() {
    const text = getText().trim();

    if (!text) {
        readingStatus.textContent =
            "Veuillez saisir un texte à lire.";
        textInput.focus();
        return;
    }

    speechSynthesis.cancel();

    currentUtterance =
        new SpeechSynthesisUtterance(text);

    currentUtterance.lang =
        languageSelect.value;

    currentUtterance.rate =
        Number(speedSelect.value);

    currentUtterance.pitch = 1;

    const index = Number(voiceSelect.value);

    if (!Number.isNaN(index) && voices[index]) {
        currentUtterance.voice = voices[index];
    }

    currentUtterance.onstart = () => {
        readingStatus.textContent =
            `🔊 Lecture en cours — durée estimée : ${formatDuration(estimateReadingTime())}`;
    };

    currentUtterance.onend = () => {
        readingStatus.textContent =
            "✅ Lecture terminée";
    };

    currentUtterance.onerror = () => {
        readingStatus.textContent =
            "❌ Erreur pendant la lecture.";
    };

    speechSynthesis.speak(currentUtterance);
}

function pauseReading() {
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.pause();
        readingStatus.textContent = "⏸ Lecture en pause";
    }
}

function stopReading() {
    speechSynthesis.cancel();
    readingStatus.textContent = "⏹ Lecture arrêtée";
}

textInput.addEventListener("input", updateCounters);

languageSelect.addEventListener("change", () => {
    loadVoices();
    readingStatus.textContent =
        "Langue sélectionnée. Texte prêt à être lu.";
});

speedSelect.addEventListener("change", () => {
    const duration = estimateReadingTime();

    if (duration) {
        readingStatus.textContent =
            `🎚️ Durée estimée : ${formatDuration(duration)}`;
    }
});

readButton.addEventListener("click", speak);
pauseButton.addEventListener("click", pauseReading);
stopButton.addEventListener("click", stopReading);

cleanButton.addEventListener("click", cleanText);
detectButton.addEventListener("click", detectLanguage);
clearButton.addEventListener("click", clearText);

speechSynthesis.onvoiceschanged = loadVoices;

updateCounters();
loadVoices();


