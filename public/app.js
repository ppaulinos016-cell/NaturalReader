const textInput = document.getElementById("text");
const languageSelect = document.getElementById("language");
const voiceSelect = document.getElementById("voice");
const speedSelect = document.getElementById("speed");
const readingMode = document.getElementById("readingMode");
const downloadButton = document.getElementById("downloadButton");
const generateVideoButton = document.getElementById("generateVideoButton");
const downloadVideoButton = document.getElementById("downloadVideoButton");
const videoPreview = document.getElementById("videoPreview");
const videoSubtitle = document.getElementById("videoSubtitle");

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
let currentAudio = null;
let currentAudioUrl = null;
let audioReadyForDownload = false;
let currentVideoUrl = null;
let videoReadyForDownload = false;
let videoSubtitleTimings = [];

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
    stopReading();
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

    const selectedLanguage = languageSelect.value;
    const names = allowedVoices[selectedLanguage] || [];

    voices = names.map(name => ({ name }));

    voiceSelect.innerHTML = "";

    voices.forEach((voice, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = voice.name;
        voiceSelect.appendChild(option);
    });

    updateDownloadButton();
}
async function speak() {
    const text = getText().trim();

    if (!text) {
        readingStatus.textContent = "⚠️ Aucun texte à lire";
        return;
    }

    const index = Number(voiceSelect.value);

    if (Number.isNaN(index) || !voices[index]) {
        readingStatus.textContent = "⚠️ Sélectionnez une voix.";
        return;
    }

    const selectedVoice = voices[index].name;
    const speed = Number(speedSelect.value);
    const mode = readingMode ? readingMode.value : "normal";

    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = null;
    }

    currentAudio = null;
    audioReadyForDownload = false;
    downloadButton.disabled = true;
    readButton.disabled = true;

    const modeLabel =
        readingMode
            ? readingMode.options[readingMode.selectedIndex].text
            : "Normal";

    readingStatus.textContent =
        mode === "normal"
            ? `⏳ Génération avec ${selectedVoice}...`
            : `🧠 Analyse intelligente — mode ${modeLabel}...`;

    try {
        const endpoint =
            mode === "normal"
                ? "/api/tts-microsoft"
                : "/api/tts-expressive";

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text,
                voiceName: selectedVoice,
                speed,
                mode,
                language: languageSelect.value
            })
        });

        if (!response.ok) {
            let message = "Erreur lors de la génération audio.";

            try {
                const data = await response.json();

                if (data.error) {
                    message = data.error;
                }
            } catch {
                // Réponse non JSON.
            }

            throw new Error(message);
        }

        const blob = await response.blob();

        if (!blob.size) {
            throw new Error("Le fichier audio généré est vide.");
        }

        currentAudioUrl = URL.createObjectURL(blob);
        currentAudio = new Audio(currentAudioUrl);

        currentAudio.onplay = () => {
            readingStatus.textContent =
                mode === "normal"
                    ? `🔊 Lecture en cours — ${selectedVoice}`
                    : `🔊 Lecture ${modeLabel} — ${selectedVoice}`;
        };

        currentAudio.onended = () => {
            audioReadyForDownload = true;
            downloadButton.disabled = false;
            readButton.disabled = false;

            readingStatus.textContent =
                "✅ Lecture terminée. L'audio est maintenant disponible au téléchargement.";
        };

        currentAudio.onerror = () => {
            audioReadyForDownload = false;
            downloadButton.disabled = true;
            readButton.disabled = false;

            readingStatus.textContent =
                "❌ Erreur pendant la lecture audio.";
        };

        await currentAudio.play();

    } catch (error) {
        console.error("Erreur NaturalReader :", error);

        readButton.disabled = false;
        downloadButton.disabled = true;
        audioReadyForDownload = false;

        readingStatus.textContent =
            `❌ ${error.message}`;
    }
}


function splitSubtitleSentences(text) {
    return text
        .replace(/\\r\\n/g, "\\n")
        .split(/(?<=[.!?…。！？])\\s+/)
        .map(value => value.trim())
        .filter(Boolean);
}

function setupVideoSubtitles() {
    if (!videoPreview || !videoSubtitle) {
        return;
    }

    if (videoPreview._naturalReaderSubtitleHandler) {
        videoPreview.removeEventListener(
            "timeupdate",
            videoPreview._naturalReaderSubtitleHandler
        );
    }

    const handler = () => {
        const currentTime =
            Number(videoPreview.currentTime) || 0;

        if (!videoSubtitleTimings.length) {
            videoSubtitle.textContent = "";
            return;
        }

        const current =
            videoSubtitleTimings.find(
                item =>
                    currentTime >= item.start &&
                    currentTime < item.end
            );

        videoSubtitle.textContent =
            current
                ? current.narration
                : "";
    };

    videoPreview._naturalReaderSubtitleHandler =
        handler;

    videoPreview.addEventListener(
        "timeupdate",
        handler
    );

    handler();
}
async function generateVideo() {
    const text = getText().trim();

    if (!text) {
        readingStatus.textContent =
            "⚠️ Aucun texte à transformer en vidéo.";
        return;
    }

    const index = Number(voiceSelect.value);

    if (Number.isNaN(index) || !voices[index]) {
        readingStatus.textContent =
            "⚠️ Sélectionnez une voix.";
        return;
    }

    const selectedVoice = voices[index].name;
    const speed = Number(speedSelect.value);
    const mode =
        readingMode ? readingMode.value : "normal";
    const language = languageSelect.value;

    if (currentVideoUrl) {
        URL.revokeObjectURL(currentVideoUrl);
        currentVideoUrl = null;
    }

    videoReadyForDownload = false;
    downloadVideoButton.disabled = true;
    generateVideoButton.disabled = true;

    const modeLabel =
        readingMode
            ? readingMode.options[
                readingMode.selectedIndex
            ].text
            : "Normal";

    readingStatus.textContent =
        `🎬 Analyse des scènes et génération du Reel — ${selectedVoice} — ${modeLabel}...`;

    try {
        const response =
            await fetch("/api/generate-reel", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text,
                    voiceName: selectedVoice,
                    speed,
                    mode,
                    language
                })
            });

        if (!response.ok) {
            let message =
                "Erreur lors de la génération vidéo.";

            try {
                const data =
                    await response.json();

                if (data.error) {
                    message = data.error;
                }
            } catch {
                // Réponse non JSON.
            }

            throw new Error(message);
        }

        const blob =
            await response.blob();

        if (!blob.size) {
            throw new Error(
                "La vidéo générée est vide."
            );
        }

        currentVideoUrl =
            URL.createObjectURL(blob);

        videoReadyForDownload = true;
        downloadVideoButton.disabled = false;

        if (videoPreview) {
            videoPreview.src = currentVideoUrl;
            videoPreview.load();
            setupVideoSubtitles();
        }
        generateVideoButton.disabled = false;

        readingStatus.textContent =
            "✅ Vidéo générée avec succès. Elle est prête à être téléchargée.";

    } catch (error) {
        console.error(
            "Erreur vidéo NaturalReader :",
            error
        );

        videoReadyForDownload = false;
        downloadVideoButton.disabled = true;
        generateVideoButton.disabled = false;

        readingStatus.textContent =
            `❌ ${error.message}`;
    }
}

function pauseReading() {
    if (!currentAudio) {
        return;
    }

    if (!currentAudio.paused) {
        currentAudio.pause();
        readingStatus.textContent = "⏸ Lecture en pause";
    } else {
        currentAudio.play();
        readingStatus.textContent = "▶️ Lecture reprise";
    }
}
function stopReading() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    audioReadyForDownload = false;
    downloadButton.disabled = true;
    readButton.disabled = false;

    readingStatus.textContent = "⏹ Lecture arrêtée";
}
textInput.addEventListener("input", updateCounters);

languageSelect.addEventListener("change", () => {
    loadVoices();
    readingStatus.textContent =
        "Langue sélectionnée. Texte prêt à être lu.";
});

readingMode.addEventListener("change", () => {
    const modeLabel =
        readingMode.options[readingMode.selectedIndex].text;

    readingStatus.textContent =
        readingMode.value === "normal"
            ? "Mode Normal : lecture standard."
            : `Mode ${modeLabel} : analyse intelligente activée.`;
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


updateCounters();
loadVoices();




function updateDownloadButton() {
    downloadButton.disabled = !audioReadyForDownload;
}

downloadButton.addEventListener("click", () => {
    if (!audioReadyForDownload || !currentAudioUrl) {
        readingStatus.textContent =
            "⚠️ Le téléchargement sera disponible après la fin de la lecture.";
        return;
    }

    const link = document.createElement("a");

    link.href = currentAudioUrl;
    link.download = "NaturalReader-audio.mp3";
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    readingStatus.textContent =
        "✅ Téléchargement de l'audio lancé.";
});

updateDownloadButton();


generateVideoButton.addEventListener("click", generateVideo);

downloadVideoButton.addEventListener("click", () => {
    if (!videoReadyForDownload || !currentVideoUrl) {
        readingStatus.textContent =
            "⚠️ Générez d'abord une vidéo.";
        return;
    }

    const link =
        document.createElement("a");

    link.href = currentVideoUrl;
    link.download =
        "NaturalReader-Reel.mp4";
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    readingStatus.textContent =
        "✅ Téléchargement de la vidéo lancé.";
});


if (videoPreview) {
    videoPreview.addEventListener("play", () => {
        videoSubtitle.style.display = "block";
    });

    videoPreview.addEventListener("pause", () => {
        videoSubtitle.style.display = "block";
    });
}
