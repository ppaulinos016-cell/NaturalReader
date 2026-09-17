const textInput = document.getElementById("text");
const languageSelect = document.getElementById("language");
const voiceSelect = document.getElementById("voice");
const speedSelect = document.getElementById("speed");
const readingMode = document.getElementById("readingMode");
const downloadButton = document.getElementById("downloadButton");

const historyButton = document.getElementById("historyButton");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const clearHistoryButton = document.getElementById("clearHistoryButton");

const HISTORY_STORAGE_KEY = "naturalReaderHistory";

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

function getHistory() {
    try {
        const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
        const parsed = saved ? JSON.parse(saved) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Erreur lecture historique :", error);
        return [];
    }
}

function saveHistory(history) {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
}

function createHistorySnapshot(action, details = {}) {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        action,
        text: getText(),
        language: languageSelect.value,
        voice: voiceSelect.value,
        speed: speedSelect.value,
        readingMode: readingMode ? readingMode.value : "normal",
        translationLanguage: document.getElementById("translationLanguage")?.value || "",
        ...details
    };
}

function addHistoryEntry(action, details = {}) {
    const entry = createHistorySnapshot(action, details);
    const history = getHistory();

    history.unshift(entry);

    saveHistory(history.slice(0, 100));
    renderHistory();
}

function formatHistoryDate(timestamp) {
    const date = new Date(timestamp);

    return date.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function restoreHistoryEntry(id) {
    const history = getHistory();
    const entry = history.find(item => item.id === id);

    if (!entry) return;

    textInput.value = entry.text || "";

    if (entry.language && [...languageSelect.options].some(option => option.value === entry.language)) {
        languageSelect.value = entry.language;
        loadVoices();

        if (entry.voice !== undefined) {
            voiceSelect.value = entry.voice;
        }
    }

    if (entry.speed !== undefined) {
        speedSelect.value = entry.speed;
    }

    if (readingMode && entry.readingMode) {
        readingMode.value = entry.readingMode;
    }

    const translationLanguage = document.getElementById("translationLanguage");

    if (
        translationLanguage &&
        entry.translationLanguage &&
        [...translationLanguage.options].some(option => option.value === entry.translationLanguage)
    ) {
        translationLanguage.value = entry.translationLanguage;
    }

    updateCounters();

    readingStatus.textContent = "Historique restauré.";

    if (historyPanel) {
        historyPanel.hidden = true;
    }
}

function deleteHistoryEntry(id) {
    const history = getHistory().filter(item => item.id !== id);
    saveHistory(history);
    renderHistory();
}

function clearHistory() {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    renderHistory();
}

function renderHistory() {
    if (!historyList) return;

    const history = getHistory();

    historyList.innerHTML = "";

    if (!history.length) {
        historyList.innerHTML = '<div class="history-empty">Aucun historique.</div>';
        return;
    }

    history.forEach(entry => {
        const item = document.createElement("div");
        item.className = "history-item";

        const preview = (entry.text || "")
            .replace(/\s+/g, " ")
            .trim();

        item.innerHTML = `
            <div class="history-item-main">
                <div class="history-item-date">${formatHistoryDate(entry.timestamp)}</div>
                <div class="history-item-action">${entry.action || "Action"}</div>
                <div class="history-item-preview">${preview || "Aucun texte"}</div>
            </div>
            <button class="history-delete text-button danger" type="button">Supprimer</button>
        `;

        item.addEventListener("click", event => {
            if (event.target.closest(".history-delete")) return;
            restoreHistoryEntry(entry.id);
        });

        item.querySelector(".history-delete").addEventListener("click", event => {
            event.stopPropagation();
            deleteHistoryEntry(entry.id);
        });

        historyList.appendChild(item);
    });
}

function toggleHistory() {
    if (!historyPanel) return;

    historyPanel.hidden = !historyPanel.hidden;

    if (!historyPanel.hidden) {
        renderHistory();
    }
}
if (historyButton) {
    historyButton.addEventListener("click", toggleHistory);
}

if (clearHistoryButton) {
    clearHistoryButton.addEventListener("click", () => {
        if (!getHistory().length) return;

        if (confirm("Supprimer tout l’historique ?")) {
            clearHistory();
        }
    });
}

renderHistory();
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
        `${characters} caractÃ¨re${characters !== 1 ? "s" : ""}`;

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
        ? "âœ¨ Texte nettoyÃ© et prÃªt Ã  Ãªtre lu"
        : "Aucun texte Ã  nettoyer";
}

function clearText() {
    stopReading();
    textInput.value = "";
    updateCounters();
    readingStatus.textContent = "PrÃªt Ã  lire";
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
        readingStatus.textContent = "Aucun texte Ã  analyser.";
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
            " ist ", " und ", " mit ", " fÃ¼r ",
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
            "Langue non dÃ©terminÃ©e. Choisissez-la manuellement.";
        return;
    }

    languageSelect.value = detected;
    loadVoices();

    const names = {
        "fr-FR": "FranÃ§ais",
        "en-GB": "English",
        "de-DE": "Deutsch"
    };

    readingStatus.textContent =
        `ðŸŒ Langue dÃ©tectÃ©e : ${names[detected]}`;
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
        ],
        "ee-TG": [
            "Ã‰wÃ© â€” MMS-TTS"
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
        readingStatus.textContent = "âš ï¸ Aucun texte Ã  lire";
        return;
    }

    const isEwe = languageSelect.value === "ee-TG";
    const index = Number(voiceSelect.value);

    if (!isEwe && (Number.isNaN(index) || !voices[index])) {
        readingStatus.textContent = "âš ï¸ SÃ©lectionnez une voix.";
        return;
    }

    const selectedVoice = isEwe ? "Ã‰wÃ© â€” MMS-TTS" : voices[index].name;
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
            ? `â³ GÃ©nÃ©ration avec ${selectedVoice}...`
            : `ðŸ§  Analyse intelligente â€” mode ${modeLabel}...`;

    try {
        const endpoint =
            isEwe
                ? "/api/tts-ewe"
                : mode === "normal"
                    ? "/api/tts-microsoft"
                    : "/api/tts-expressive";

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(
                isEwe
                    ? { text }
                    : {
                        text,
                        voiceName: selectedVoice,
                        speed,
                        mode,
                        language: languageSelect.value
                    }
            )
        });

        if (!response.ok) {
            let message = "Erreur lors de la gÃ©nÃ©ration audio.";

            try {
                const data = await response.json();

                if (data.error) {
                    message = data.error;
                }
            } catch {
                // RÃ©ponse non JSON.
            }

            throw new Error(message);
        }

        const blob = await response.blob();

        if (!blob.size) {
            throw new Error("Le fichier audio gÃ©nÃ©rÃ© est vide.");
        }

        currentAudioUrl = URL.createObjectURL(blob);
        currentAudio = new Audio(currentAudioUrl);

        currentAudio.onplay = () => {
            readingStatus.textContent =
                mode === "normal"
                    ? `ðŸ”Š Lecture en cours â€” ${selectedVoice}`
                    : `ðŸ”Š Lecture ${modeLabel} â€” ${selectedVoice}`;
        };

        currentAudio.onended = () => {
            audioReadyForDownload = true;
            downloadButton.disabled = false;
            readButton.disabled = false;

            readingStatus.textContent =
                "âœ… Lecture terminÃ©e. L'audio est maintenant disponible au tÃ©lÃ©chargement.";
        };

        currentAudio.onerror = () => {
            audioReadyForDownload = false;
            downloadButton.disabled = true;
            readButton.disabled = false;

            readingStatus.textContent =
                "âŒ Erreur pendant la lecture audio.";
        };

        await currentAudio.play();

    } catch (error) {
        console.error("Erreur NaturalReader :", error);

        readButton.disabled = false;
        downloadButton.disabled = true;
        audioReadyForDownload = false;

        readingStatus.textContent =
            `âŒ ${error.message}`;
    }
}


function splitSubtitleSentences(text) {
    return text
        .replace(/\\r\\n/g, "\\n")
        .split(/(?<=[.!?â€¦ã€‚ï¼ï¼Ÿ])\\s+/)
        .map(value => value.trim())
        .filter(Boolean);
}

function pauseReading() {
    if (!currentAudio) {
        return;
    }

    if (!currentAudio.paused) {
        currentAudio.pause();
        readingStatus.textContent = "â¸ Lecture en pause";
    } else {
        currentAudio.play();
        readingStatus.textContent = "â–¶ï¸ Lecture reprise";
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

    readingStatus.textContent = "â¹ Lecture arrÃªtÃ©e";
}
textInput.addEventListener("input", updateCounters);

languageSelect.addEventListener("change", () => {
    loadVoices();
    readingStatus.textContent =
        "Langue sÃ©lectionnÃ©e. Texte prÃªt Ã  Ãªtre lu.";
});

readingMode.addEventListener("change", () => {
    const modeLabel =
        readingMode.options[readingMode.selectedIndex].text;

    readingStatus.textContent =
        readingMode.value === "normal"
            ? "Mode Normal : lecture standard."
            : `Mode ${modeLabel} : analyse intelligente activÃ©e.`;
});

speedSelect.addEventListener("change", () => {
    const duration = estimateReadingTime();

    if (duration) {
        readingStatus.textContent =
            `ðŸŽšï¸ DurÃ©e estimÃ©e : ${formatDuration(duration)}`;
    }
});

readButton.addEventListener("click", () => { addHistoryEntry("Lecture du texte"); speak(); });
pauseButton.addEventListener("click", pauseReading);
stopButton.addEventListener("click", stopReading);

cleanButton.addEventListener("click", () => { cleanText(); addHistoryEntry("Nettoyage du texte"); });
detectButton.addEventListener("click", () => { detectLanguage(); addHistoryEntry("Détection de la langue"); });
clearButton.addEventListener("click", () => { clearText(); addHistoryEntry("Effacement du texte"); });


updateCounters();
loadVoices();




function updateDownloadButton() {
    downloadButton.disabled = !audioReadyForDownload;
}

downloadButton.addEventListener("click", () => {
    if (!audioReadyForDownload || !currentAudioUrl) {
        readingStatus.textContent =
            "âš ï¸ Le tÃ©lÃ©chargement sera disponible aprÃ¨s la fin de la lecture.";
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
        "âœ… TÃ©lÃ©chargement de l'audio lancÃ©.";
});

updateDownloadButton();


/* ================================
   TRADUCTION
================================ */

const translationLanguage =
    document.getElementById("translationLanguage");

const translateButton =
    document.getElementById("translateButton");

const downloadTranslationPdfButton =
    document.getElementById("downloadTranslationPdfButton");

const downloadTranslationImageButton =
    document.getElementById("downloadTranslationImageButton");

const downloadTranslationWordButton =
    document.getElementById("downloadTranslationWordButton");

const importButton =
    document.getElementById("importButton");

const importMenu =
    document.getElementById("importMenu");

const choosePhotoButton =
    document.getElementById("choosePhotoButton");

const takePhotoButton =
    document.getElementById("takePhotoButton");

const choosePdfButton =
    document.getElementById("choosePdfButton");

const photoInput =
    document.getElementById("photoInput");

const cameraInput =
    document.getElementById("cameraInput");

const pdfInput =
    document.getElementById("pdfInput");

let translationReady = false;

function updateTranslationDownloadButtons() {
    const disabled = !translationReady || !getText().trim();

    if (downloadTranslationPdfButton) {
        downloadTranslationPdfButton.disabled = disabled;
    }

    if (downloadTranslationImageButton) {
        downloadTranslationImageButton.disabled = disabled;
    }

    if (downloadTranslationWordButton) {
        downloadTranslationWordButton.disabled = disabled;
    }
}

async function translateText() {
    const text = getText().trim();

    if (!text) {
        readingStatus.textContent =
            "âš ï¸ Aucun texte Ã  traduire.";
        return;
    }

    const target =
        translationLanguage?.value || "fr";

    const sourceMap = {
        "fr-FR": "fr",
        "en-GB": "en",
        "de-DE": "de",
        "ee-TG": "ee"
    };

    const source =
        sourceMap[languageSelect.value] || "auto";

    if (source === target) {
        translationReady = true;
        updateTranslationDownloadButtons();

        readingStatus.textContent =
            "â„¹ï¸ Le texte est dÃ©jÃ  dans cette langue.";

        return;
    }

    if (translateButton) {
        translateButton.disabled = true;
    }

    translationReady = false;
    updateTranslationDownloadButtons();

    readingStatus.textContent =
        "ðŸŒ Traduction en cours...";

    try {
        const response = await fetch(
            "/api/translate",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text,
                    targetLanguage: target,
                    sourceLanguage: source
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Impossible de traduire le texte."
            );
        }

        if (!data.text) {
            throw new Error(
                "La traduction reÃ§ue est vide."
            );
        }

        textInput.value =
            data.text;

        const targetToReaderLanguage = {
            fr: "fr-FR",
            en: "en-GB",
            de: "de-DE",
        ee: "ee-TG"
        };

        if (targetToReaderLanguage[target]) {
            languageSelect.value =
                targetToReaderLanguage[target];

            loadVoices();
        }

        translationReady = true;
        updateCounters();
        updateTranslationDownloadButtons();

        const names = {
            fr: "FranÃ§ais",
            en: "English",
            de: "Deutsch"
        };

        readingStatus.textContent =
            `âœ… Texte traduit en ${names[target]}.`;

    } catch (error) {
        console.error(
            "Erreur traduction NaturalReader :",
            error
        );

        translationReady = false;
        updateTranslationDownloadButtons();

        readingStatus.textContent =
            `âŒ ${error.message}`;

    } finally {
        if (translateButton) {
            translateButton.disabled = false;
        }
    }
}


/* ================================
   IMPORT PHOTO / CAMÃ‰RA / PDF
================================ */

async function extractImportedFile(file) {
    if (!file) {
        return;
    }

    if (file.size > 15 * 1024 * 1024) {
        readingStatus.textContent =
            "âš ï¸ Le fichier est trop volumineux (15 Mo maximum).";
        return;
    }

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );

    readingStatus.textContent =
        file.type === "application/pdf"
            ? "ðŸ“„ Extraction du texte du PDF..."
            : "ðŸ“· Analyse de l'image et extraction du texte...";

    try {
        const response = await fetch(
            "/api/extract-document",
            {
                method: "POST",
                body: formData
            }
        );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Impossible d'extraire le texte."
            );
        }

        if (!data.text) {
            throw new Error(
                "Aucun texte n'a Ã©tÃ© trouvÃ©."
            );
        }

        textInput.value =
            data.text;

        translationReady = false;

        updateCounters();
        updateTranslationDownloadButtons();

        readingStatus.textContent =
            data.type === "pdf"
                ? "âœ… Texte extrait du PDF."
                : "âœ… Texte extrait de l'image.";

    } catch (error) {
        console.error(
            "Erreur import NaturalReader :",
            error
        );

        readingStatus.textContent =
            `âŒ ${error.message}`;

    } finally {
        if (photoInput) {
            photoInput.value = "";
        }

        if (cameraInput) {
            cameraInput.value = "";
        }

        if (pdfInput) {
            pdfInput.value = "";
        }
    }
}


/* ================================
   MENU +
================================ */

if (importButton && importMenu) {
    importButton.addEventListener(
        "click",
        event => {
            event.stopPropagation();
            importMenu.hidden =
                !importMenu.hidden;
        }
    );

    document.addEventListener(
        "click",
        event => {
            if (
                !importMenu.contains(event.target) &&
                !importButton.contains(event.target)
            ) {
                importMenu.hidden = true;
            }
        }
    );
}

if (choosePhotoButton && photoInput) {
    choosePhotoButton.addEventListener(
        "click",
        () => {
            importMenu.hidden = true;
            photoInput.click();
        }
    );
}

if (takePhotoButton && cameraInput) {
    takePhotoButton.addEventListener(
        "click",
        () => {
            importMenu.hidden = true;
            cameraInput.click();
        }
    );
}

if (choosePdfButton && pdfInput) {
    choosePdfButton.addEventListener(
        "click",
        () => {
            importMenu.hidden = true;
            pdfInput.click();
        }
    );
}

if (photoInput) {
    photoInput.addEventListener(
        "change",
        () => {
            extractImportedFile(
                photoInput.files?.[0]
            );
        }
    );
}

if (cameraInput) {
    cameraInput.addEventListener(
        "change",
        () => {
            extractImportedFile(
                cameraInput.files?.[0]
            );
        }
    );
}

if (pdfInput) {
    pdfInput.addEventListener(
        "change",
        () => {
            extractImportedFile(
                pdfInput.files?.[0]
            );
        }
    );
}


/* ================================
   TÃ‰LÃ‰CHARGEMENT PDF / IMAGE
================================ */

async function downloadTranslation(format) {
    const text =
        getText().trim();

    if (!translationReady || !text) {
        readingStatus.textContent =
            "âš ï¸ Traduisez d'abord le texte.";
        return;
    }

    const language =
        translationLanguage?.value || "fr";

    const endpoint =
        format === "pdf"
            ? "/api/export-pdf"
            : format === "word"
                ? "/api/export-word"
                : "/api/export-image";

    const filename =
        format === "pdf"
            ? "NaturalReader-traduction.pdf"
            : format === "word"
                ? "NaturalReader-traduction.docx"
                : "NaturalReader-traduction.svg";

    readingStatus.textContent =
        format === "pdf"
            ? "ðŸ“„ CrÃ©ation du PDF..."
            : "ðŸ–¼ï¸ CrÃ©ation de l'image...";

    if (format === "pdf" &&
        downloadTranslationPdfButton) {
        downloadTranslationPdfButton.disabled =
            true;
    }

    if (format === "image" &&
        downloadTranslationImageButton) {
        downloadTranslationImageButton.disabled =
            true;
    }

    try {
        const response =
            await fetch(
                endpoint,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        text,
                        language
                    })
                }
            );

        if (!response.ok) {
            let message =
                "Impossible de crÃ©er le fichier.";

            try {
                const data =
                    await response.json();

                if (data.error) {
                    message =
                        data.error;
                }
            } catch {
                // RÃ©ponse non JSON.
            }

            throw new Error(message);
        }

        const blob =
            await response.blob();

        if (!blob.size) {
            throw new Error(
                "Le fichier gÃ©nÃ©rÃ© est vide."
            );
        }

        const url =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        link.href = url;
        link.download = filename;
        link.style.display = "none";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(
            () => URL.revokeObjectURL(url),
            1000
        );

        readingStatus.textContent =
            format === "pdf"
                ? "âœ… PDF tÃ©lÃ©chargÃ©."
                : "âœ… Image tÃ©lÃ©chargÃ©e.";

    } catch (error) {
        console.error(
            "Erreur export NaturalReader :",
            error
        );

        readingStatus.textContent =
            `âŒ ${error.message}`;

    } finally {
        updateTranslationDownloadButtons();
    }
}

if (translateButton) {
    translateButton.addEventListener(
        "click",
        translateText
    );
}

if (downloadTranslationPdfButton) {
    downloadTranslationPdfButton.addEventListener(
        "click",
        () => downloadTranslation("pdf")
    );
}

if (downloadTranslationImageButton) {
    downloadTranslationImageButton.addEventListener(
        "click",
        () => downloadTranslation("image")
    );
}

textInput.addEventListener(
    "input",
    () => {
        translationReady = false;
        updateTranslationDownloadButtons();
    }
);

updateTranslationDownloadButtons();
