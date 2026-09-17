import re
from dataclasses import dataclass, field


@dataclass
class EweGrammarAnalysis:
    original_text: str
    sentence_type: str = "declarative"
    pronouns: list = field(default_factory=list)
    tense_aspect: list = field(default_factory=list)
    negation: bool = False
    final_particles: list = field(default_factory=list)
    confidence: str = "low"
    speech_strategy: str = "natural"
    preserve_text: bool = True


SUBJECT_PRONOUNS = {
    "mè": ("1sg", "subject"),
    "me": ("1sg", "subject"),
    "è": ("2sg", "subject"),
    "e": ("2sg", "subject"),
    "é": ("3sg", "subject"),
    "é́": ("3sg", "subject"),
    "mí": ("1pl", "subject"),
    "mi": ("1pl_or_2pl", "subject"),
    "mì": ("2pl", "subject"),
    "wó": ("3pl", "subject"),
    "wo": ("3pl", "subject"),
}


FINAL_PARTICLES = {
    "à": "propositional_question",
    "a": "propositional_question",
    "ɖé": "confirmation_question",
    "de": "confirmation_question",
    "sea": "hear_you",
}


def detect_sentence_type(text: str) -> str:
    stripped = text.strip()
    words = re.findall(r"\S+", stripped.lower())

    # Grammatical structure has priority over punctuation.
    if words:
        first = words[0].rstrip(",;:.!?")
        if first in {"yi", "va", "ɖu", "dzo", "wɔ"}:
            return "imperative"

    if stripped.endswith("?"):
        return "interrogative"

    if stripped.endswith("!"):
        return "exclamative"

    return "declarative"


def detect_pronouns(text: str) -> list:
    results = []

    for word in re.findall(r"\S+", text):
        clean = word.strip(",;:.!?()[]{}\"'").lower()

        # Stand-alone subject pronoun.
        if clean in SUBJECT_PRONOUNS:
            person, role = SUBJECT_PRONOUNS[clean]
            results.append({
                "surface": word,
                "person": person,
                "role": role,
                "attached": False,
            })
            continue

        # Future forms can attach the future marker to the
        # subject pronoun, e.g. Wóá.
        for pronoun, (person, role) in SUBJECT_PRONOUNS.items():
            if clean.startswith(pronoun + "á"):
                results.append({
                    "surface": word,
                    "person": person,
                    "role": role,
                    "attached": True,
                    "marker": "future",
                })
                break

        # Logophoric pronoun, especially in reported/reference
        # structures such as yè-dzo.
        if re.search(r"^yè[--]", clean):
            results.append({
                "surface": word,
                "person": "logophoric",
                "role": "pronoun",
                "attached": True,
            })

    return results


def detect_tense_aspect(text: str) -> list:
    lower = text.lower()
    results = []

    # Progressive present: subject + le + verbal form
    if re.search(r"\b(?:mè|me|è|e|é|mí|mi|mì|wó|wo)\s+le\b", lower):
        results.append("progressive_present")

    # Progressive past / progressive with nɔ
    if re.search(r"\b(?:mè|me|è|e|é|mí|mi|mì|wó|wo)\s+nɔ\b", lower):
        results.append("progressive_past_or_future_progressive")

    # Future marker
    if re.search(r"\b(?:á|ǎ|mǎ|míá|mìá|wóá)\b", lower):
        results.append("future")

    # Habitual marker / suffix
    if re.search(r"\b\w+na\b", lower):
        results.append("habitual")

    # Imperative-like bare verb at the beginning
    if re.match(r"^\s*(?:yi|va|dzo|ɖu|wɔ)\b", lower):
        results.append("imperative")

    # Bare verb / aorist-like construction
    if not results:
        results.append("aorist_or_contextual_past")

    return list(dict.fromkeys(results))


def detect_negation(text: str) -> bool:
    lower = text.lower()

    if re.search(r"\bmé\w*", lower):
        return True

    if re.search(r"\bme\w*", lower):
        # Conservative: only treat as possible negation when
        # sentence-final o is also present.
        if re.search(r"\bo[.!?]?\s*$", lower):
            return True

    return False


def detect_final_particles(text: str) -> list:
    results = []

    words = re.findall(r"\S+", text.lower())

    for word in words:
        clean = word.strip(",;:.!?()[]{}\"'")

        if clean in FINAL_PARTICLES:
            results.append({
                "surface": word,
                "function": FINAL_PARTICLES[clean],
            })

    return results


def analyze_ewe(text: str) -> EweGrammarAnalysis:
    analysis = EweGrammarAnalysis(
        original_text=text,
        sentence_type=detect_sentence_type(text),
        pronouns=detect_pronouns(text),
        tense_aspect=detect_tense_aspect(text),
        negation=detect_negation(text),
        final_particles=detect_final_particles(text),
    )

    detected = (
        len(analysis.pronouns)
        + len(analysis.tense_aspect)
        + int(analysis.negation)
        + len(analysis.final_particles)
    )

    if detected >= 2:
        analysis.confidence = "medium"

    if detected >= 3:
        analysis.confidence = "high"

    # Conservative TTS policy:
    # grammar analysis informs the speech pipeline but does not
    # rewrite the original Ewe text.
    if analysis.sentence_type == "interrogative":
        analysis.speech_strategy = "question"
    elif analysis.sentence_type == "imperative":
        analysis.speech_strategy = "imperative"
    elif analysis.sentence_type == "exclamative":
        analysis.speech_strategy = "exclamation"
    elif analysis.negation:
        analysis.speech_strategy = "negative"
    elif analysis.tense_aspect:
        analysis.speech_strategy = analysis.tense_aspect[0]

    return analysis
