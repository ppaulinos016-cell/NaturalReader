const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const https = require("https");

const OUTPUT_DIR =
    "C:\\Users\\hp\\NaturalReader\\video\\images";

const CACHE_DIR =
    "C:\\Users\\hp\\NaturalReader\\video\\cache";

const USER_AGENT =
    "NaturalReader/1.0 local video engine";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenize(text) {
    return normalize(text)
        .split(/\s+/)
        .filter(Boolean);
}

function safeKey(text) {
    return (
        normalize(text)
            .replace(/[^a-z0-9]+/gi, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 100) ||
        "scene"
    );
}

function requestJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(
            url,
            {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json"
                }
            },
            response => {
                let data = "";

                response.setEncoding("utf8");

                response.on("data", chunk => {
                    data += chunk;
                });

                response.on("end", () => {
                    if (response.statusCode === 429) {
                        reject(new Error("RATE_LIMIT"));
                        return;
                    }

                    if (response.statusCode === 401) {
                        reject(new Error("AUTH_REQUIRED"));
                        return;
                    }

                    if (
                        response.statusCode < 200 ||
                        response.statusCode >= 300
                    ) {
                        reject(
                            new Error(
                                `HTTP_${response.statusCode}`
                            )
                        );
                        return;
                    }

                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );

        req.setTimeout(15000, () => {
            req.destroy(
                new Error("HTTP_TIMEOUT")
            );
        });

        req.on("error", reject);
    });
}

function downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
        const file =
            fs.createWriteStream(
                destination
            );

        let settled = false;

        const cleanup = () => {
            try {
                file.destroy();
            } catch {}

            fs.unlink(
                destination,
                () => {}
            );
        };

        const fail = error => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };

        const succeed = () => {
            if (settled) return;
            settled = true;
            resolve();
        };

        const req = https.get(
            url,
            {
                headers: {
                    "User-Agent": USER_AGENT
                }
            },
            response => {
                if (
                    response.statusCode >= 300 &&
                    response.statusCode < 400 &&
                    response.headers.location
                ) {
                    cleanup();

                    const nextUrl =
                        new URL(
                            response.headers.location,
                            url
                        ).toString();

                    downloadFile(
                        nextUrl,
                        destination
                    )
                        .then(succeed)
                        .catch(fail);

                    return;
                }

                if (
                    response.statusCode === 429 ||
                    response.statusCode === 401
                ) {
                    fail(
                        new Error(
                            response.statusCode === 401
                                ? "AUTH_REQUIRED"
                                : "RATE_LIMIT"
                        )
                    );
                    return;
                }

                if (
                    response.statusCode < 200 ||
                    response.statusCode >= 300
                ) {
                    fail(
                        new Error(
                            `DOWNLOAD_HTTP_${response.statusCode}`
                        )
                    );
                    return;
                }

                response.pipe(file);

                file.on("finish", () => {
                    file.close(error => {
                        if (error) {
                            fail(error);
                            return;
                        }

                        succeed();
                    });
                });

                file.on("error", fail);
            }
        );

        req.setTimeout(20000, () => {
            req.destroy(
                new Error("DOWNLOAD_TIMEOUT")
            );
        });

        req.on("error", fail);
    });
}

function buildQueries(scene) {
    const narration =
        scene?.narration || "";

    const subject =
        scene?.subject &&
        scene.subject !== "scene"
            ? scene.subject
            : "";

    const location =
        scene?.location &&
        scene.location !== "environment"
            ? scene.location
            : "";

    const action =
        scene?.action &&
        scene.action !== "static"
            ? scene.action
            : "";

    const keywords =
        Array.isArray(scene?.keywords)
            ? scene.keywords
            : [];

    const queries = [
        [
            narration,
            subject,
            action,
            location
        ].filter(Boolean).join(" ").trim(),

        [
            subject,
            action,
            location
        ].filter(Boolean).join(" ").trim(),

        [
            narration,
            location
        ].filter(Boolean).join(" ").trim(),

        [
            subject,
            ...keywords
        ].filter(Boolean).join(" ").trim()
    ];

    return [
        ...new Set(
            queries.filter(Boolean)
        )
    ];
}

function scoreCandidate(
    item,
    scene
) {
    const haystack =
        normalize(
            [
                item?.title,
                item?.description,
                item?.tags,
                item?.creator
            ]
                .filter(Boolean)
                .join(" ")
        );

    const queryWords =
        tokenize(
            [
                scene?.narration,
                scene?.subject,
                scene?.location,
                scene?.action,
                ...(scene?.keywords || [])
            ]
                .filter(Boolean)
                .join(" ")
        );

    let score = 0;

    for (const word of queryWords) {
        if (
            word.length >= 3 &&
            haystack.includes(word)
        ) {
            score += 4;
        }
    }

    if (
        scene?.subject &&
        haystack.includes(
            normalize(scene.subject)
        )
    ) {
        score += 35;
    }

    if (
        scene?.location &&
        haystack.includes(
            normalize(scene.location)
        )
    ) {
        score += 25;
    }

    if (
        scene?.action &&
        haystack.includes(
            normalize(scene.action)
        )
    ) {
        score += 25;
    }

    return score;
}

function rankCandidates(
    results,
    scene
) {
    return results
        .map(item => ({
            ...item,
            score:
                scoreCandidate(
                    item,
                    scene
                )
        }))
        .sort(
            (a, b) =>
                Number(b.score || 0) -
                Number(a.score || 0)
        );
}

async function searchOpenverse(
    query
) {
    const url =
        "https://api.openverse.org/v1/images/" +
        "?q=" +
        encodeURIComponent(query) +
        "&page_size=20";

    const data =
        await requestJson(url);

    return Array.isArray(
        data?.results
    )
        ? data.results
        : [];
}

async function searchWikimedia(
    query
) {
    const url =
        "https://commons.wikimedia.org/w/api.php" +
        "?action=query" +
        "&generator=search" +
        "&gsrsearch=" +
        encodeURIComponent(query) +
        "&gsrnamespace=6" +
        "&gsrlimit=20" +
        "&prop=imageinfo" +
        "&iiprop=url%7Cextmetadata" +
        "&iiurlwidth=2000" +
        "&format=json" +
        "&origin=*";

    const data =
        await requestJson(url);

    const pages =
        Object.values(
            data?.query?.pages || {}
        );

    return pages
        .map(page => {
            const info =
                page?.imageinfo?.[0] || {};

            const metadata =
                info?.extmetadata || {};

            return {
                title:
                    String(
                        page?.title || ""
                    ).replace(
                        /^File:/i,
                        ""
                    ),

                description:
                    metadata
                        ?.ImageDescription
                        ?.value ||
                    "",

                creator:
                    metadata
                        ?.Artist
                        ?.value ||
                    "",

                url:
                    info?.thumburl ||
                    info?.url ||
                    ""
            };
        })
        .filter(
            item => Boolean(item.url)
        );
}

async function readCache(
    cacheFile
) {
    try {
        return JSON.parse(
            await fsp.readFile(
                cacheFile,
                "utf8"
            )
        );
    } catch {
        return null;
    }
}

async function isUsableFile(
    filePath
) {
    try {
        const stat =
            await fsp.stat(
                filePath
            );

        return (
            stat.isFile() &&
            stat.size > 1000
        );
    } catch {
        return false;
    }
}

async function findSemanticCache(
    scene
) {
    if (
        !fs.existsSync(
            CACHE_DIR
        )
    ) {
        return null;
    }

    const files =
        fs.readdirSync(
            CACHE_DIR
        )
        .filter(
            name =>
                name
                    .toLowerCase()
                    .endsWith(".json")
        );

    const candidates = [];

    for (const file of files) {
        try {
            const data =
                JSON.parse(
                    fs.readFileSync(
                        path.join(
                            CACHE_DIR,
                            file
                        ),
                        "utf8"
                    )
                );

            if (
                !data?.localPath ||
                !(await isUsableFile(
                    data.localPath
                ))
            ) {
                continue;
            }

            const score =
                scoreCandidate(
                    {
                        title:
                            data.title,
                        description:
                            data.description,
                        tags:
                            data.tags,
                        creator:
                            data.creator
                    },
                    scene
                );

            if (
                score >= 35
            ) {
                candidates.push({
                    ...data,
                    score,
                    source:
                        "semantic-cache"
                });
            }
        } catch {}
    }

    candidates.sort(
        (a, b) =>
            Number(b.score || 0) -
            Number(a.score || 0)
    );

    return (
        candidates[0] ||
        null
    );
}

async function findAndDownloadImage(
    scene,
    index
) {
    await fsp.mkdir(
        OUTPUT_DIR,
        { recursive: true }
    );

    await fsp.mkdir(
        CACHE_DIR,
        { recursive: true }
    );

    const queries =
        buildQueries(
            scene
        );

    const cacheKey =
        safeKey(
            queries.join(" | ")
        );

    const cacheFile =
        path.join(
            CACHE_DIR,
            `${cacheKey}.json`
        );

    /*
     * Cache uniquement si la signature correspond
     * au contenu réellement demandé.
     */
    const cached =
        await readCache(
            cacheFile
        );

    if (
        cached?.localPath &&
        cached?.sceneSignature &&
        await isUsableFile(
            cached.localPath
        )
    ) {
        const cachedScore =
            scoreCandidate(
                cached,
                scene
            );

        if (
            cachedScore >= 35
        ) {
            console.log(
                `Cache sémantique correspondant utilisé pour la scène ${index + 1}.`
            );

            return cached;
        }
    }

    let ranked = [];

    /*
     * Source 1 : Openverse.
     */
    for (
        const query of queries
    ) {
        try {
            console.log(
                `Recherche Openverse : ${query}`
            );

            const results =
                await searchOpenverse(
                    query
                );

            if (
                results.length
            ) {
                ranked =
                    rankCandidates(
                        results,
                        scene
                    );

                if (
                    ranked.length
                ) {
                    break;
                }
            }
        } catch (error) {
            console.warn(
                `Openverse indisponible : ${error.message}`
            );

            if (
                error.message ===
                "RATE_LIMIT"
            ) {
                await sleep(2500);
            }
        }
    }

    /*
     * Source 2 : Wikimedia Commons
     * seulement si Openverse n'a rien donné.
     */
    if (
        !ranked.length
    ) {
        for (
            const query of queries
        ) {
            try {
                console.log(
                    `Recherche Wikimedia : ${query}`
                );

                const results =
                    await searchWikimedia(
                        query
                    );

                if (
                    results.length
                ) {
                    ranked =
                        rankCandidates(
                            results,
                            scene
                        );

                    if (
                        ranked.length
                    ) {
                        break;
                    }
                }
            } catch (error) {
                console.warn(
                    `Wikimedia indisponible : ${error.message}`
                );

                if (
                    error.message ===
                    "RATE_LIMIT"
                ) {
                    await sleep(3000);
                }
            }
        }
    }

    /*
     * Source 3 : cache local uniquement si
     * l'image est réellement pertinente.
     */
    if (
        !ranked.length
    ) {
        const semanticFallback =
            await findSemanticCache(
                scene
            );

        if (
            semanticFallback
        ) {
            console.warn(
                `Fallback cache SEMANTIQUE utilisé pour la scène ${index + 1}.`
            );

            return semanticFallback;
        }

        throw new Error(
            `NO_IMAGE_AVAILABLE_SCENE_${index + 1}`
        );
    }

    let selected = null;
    let localPath = null;

    for (
        let i = 0;
        i < Math.min(
            ranked.length,
            10
        );
        i++
    ) {
        const candidate =
            ranked[i];

        if (
            !candidate?.url
        ) {
            continue;
        }

        const extension =
            /\.(png|webp)(\?|$)/i.test(
                candidate.url
            )
                ? /\.(webp)(\?|$)/i.test(
                    candidate.url
                )
                    ? ".webp"
                    : ".png"
                : ".jpg";

        const fileKey =
            safeKey(
                `${cacheKey}-${i}-${candidate.url}`
            );

        localPath =
            path.join(
                OUTPUT_DIR,
                `${fileKey}${extension}`
            );

        try {
            await downloadFile(
                candidate.url,
                localPath
            );

            if (
                await isUsableFile(
                    localPath
                )
            ) {
                selected =
                    candidate;
                break;
            }

            await fsp.unlink(
                localPath
            ).catch(
                () => {}
            );
        } catch (error) {
            await fsp.unlink(
                localPath
            ).catch(
                () => {}
            );

            console.warn(
                `Image candidate ignorée : ${error.message}`
            );
        }
    }

    if (
        !selected
    ) {
        const semanticFallback =
            await findSemanticCache(
                scene
            );

        if (
            semanticFallback
        ) {
            console.warn(
                `Fallback cache SEMANTIQUE utilisé après échec de téléchargement pour la scène ${index + 1}.`
            );

            return semanticFallback;
        }

        throw new Error(
            `NO_IMAGE_AVAILABLE_SCENE_${index + 1}`
        );
    }

    const result = {
        ...selected,

        localPath,

        searchedQueries:
            queries,

        sceneSignature: {
            narration:
                scene?.narration || "",
            subject:
                scene?.subject || "",
            location:
                scene?.location || "",
            action:
                scene?.action || ""
        }
    };

    await fsp.writeFile(
        cacheFile,
        JSON.stringify(
            result,
            null,
            2
        ),
        "utf8"
    );

    console.log(
        `Image associée à la scène ${index + 1} : ${result.title || "Image recherchée"}`
    );

    return result;
}

module.exports = {
    searchOpenverse,
    searchWikimedia,
    findAndDownloadImage,
    rankCandidates
};
