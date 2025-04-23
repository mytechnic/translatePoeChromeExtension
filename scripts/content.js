// scripts/content.js
(() => {
    let path = '';
    let page = '';
    let cacheVersion = -1;
    let dictionary = {};
    let dictionaryInitialized = false;
    let pendingTranslateRequest = false;
    let isChangedDocument = false;
    let autoTranslate = false;
    let documentCache = {};
    let documentCacheSize = 0;
    let sortedPatternKeys = [];
    const regexCache = new Map();
    const translatedNodes = new WeakSet();

    const localStorageInit = {version: -1, dictionary: {h: {}, p: {}}, documentCache: {}};
    const syncStorageInit = {page: {}, path: {}};

    const toLowerCase = (text) => text?.toLowerCase() ?? text;
    const getPageUrl = (url) => url.split('?')[0].replace(/\/$/, '');
    const getPathUrl = (url) => url.split('?')[0].split('/').slice(0, -1).join('/') + '/';
    const getCacheKey = (text) => text?.toLowerCase().replaceAll(' ', '') ?? text;
    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isNumericAndSpecialCharactersOnly = (str) =>
        /^[0-9\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]*$/.test(str);

    const getExHashKey = (hashKey) => {
        const parts = hashKey.split(' - ');
        return parts.length > 1 ? parts[0].trim() : null;
    };

    const getCachedRegex = (pattern) => {
        if (!regexCache.has(pattern)) {
            const regex = new RegExp(pattern.replace(/\+/g, '\\+').replace(/#/g, '(\\d+)'), 'i');
            regexCache.set(pattern, regex);
        }
        return regexCache.get(pattern);
    };

    const regexTranslate = (text, source, target) => {
        const regex = getCachedRegex(source);
        const matched = text.trim().match(regex);
        if (matched) {
            for (let i = 1; i < matched.length; i++) {
                target = target.replace(/#/, matched[i]);
            }
            return target.replace(regex, target);
        }
    };

    const fuzzyScore = (a, b) => {
        if (!a || !b) return 0;
        const setA = new Set(a);
        const setB = new Set(b);
        const common = [...setA].filter(ch => setB.has(ch)).length;
        return common / Math.max(setA.size, setB.size);
    };

    const getDocumentCache = (key) => documentCache[key] ?? null;

    const storeDocumentLocalCache = (key, value) => {
        isChangedDocument = true;
        if (documentCacheSize > 150000) {
            Object.keys(documentCache).slice(0, 5000).forEach((k) => delete documentCache[k]);
            documentCacheSize -= 5000;
        } else {
            documentCacheSize++;
        }
        documentCache[key] = value ?? -1;
    };

    const translateText = (text) => {
        const word = text.trim();
        const hashKey = toLowerCase(word);
        const exHashKey = getExHashKey(hashKey);

        if (dictionary.h[hashKey]) return text.replaceAll(word, dictionary.h[hashKey]);
        if (dictionary.p[hashKey]) return text.replaceAll(word, dictionary.p[hashKey]);

        if (exHashKey) {
            if (dictionary.h[exHashKey]) return text.replace(new RegExp(exHashKey, 'i'), dictionary.h[exHashKey]);
            if (dictionary.p[exHashKey]) return text.replace(new RegExp(exHashKey, 'i'), dictionary.p[exHashKey]);
        }

        for (const key of sortedPatternKeys) {
            const result = regexTranslate(text, key, dictionary.p[key]);
            if (result) return result;
        }

        let bestMatch = null;
        let bestScore = 0;
        for (const key of Object.keys(dictionary.p)) {
            if (Math.abs(hashKey.length - key.length) > 5) continue;
            const score = fuzzyScore(hashKey, key);
            if (score > bestScore && score >= 0.8) {
                bestMatch = key;
                bestScore = score;
            }
        }

        if (bestMatch) {
            return text.replace(new RegExp(escapeRegExp(bestMatch), 'i'), dictionary.p[bestMatch]);
        }

        return null;
    };

    const translateNode = (node) => {
        if (node.nodeType !== 3) {
            node.childNodes.forEach(translateNode);
            return;
        }

        if (translatedNodes.has(node)) return;
        translatedNodes.add(node);

        const raw = node.nodeValue;
        if (!raw || raw.length > 400 || raw.includes('<') || isNumericAndSpecialCharactersOnly(raw)) return;

        const key = getCacheKey(raw);
        const cached = getDocumentCache(key);
        if (cached === -1) return;
        if (cached) {
            node.nodeValue = cached;
            return;
        }

        const translated = translateText(raw);
        if (translated) {
            node.nodeValue = translated;
            storeDocumentLocalCache(key, translated);
        } else {
            storeDocumentLocalCache(key);
        }
    };

    const observeDocumentChanges = () => {
        const observer = new MutationObserver((mutations) => {
            if (!autoTranslate) return;
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 || node.nodeType === 3) {
                        translateNode(node);
                    }
                });
            });
        });

        observer.observe(document.body, {childList: true, subtree: true});
    };

    const changeEventListener = () => {
        onChangeStorage(async (changes, namespace) => {
            for (const [key, {newValue}] of Object.entries(changes)) {
                if (namespace === 'sync' && (key === 'page' || key === 'path')) {
                    autoTranslate = newValue;
                    if (autoTranslate) {
                        const [version, localStore] = await Promise.all([versionPromise(), localStoragePromise()]);
                        const localVersion = localStore.version ?? -1;

                        if (version > localVersion) {
                            dictionary = await dictionaryPromise();
                            setLocalStorage({version, dictionary, documentCache: {}});
                        } else {
                            dictionary = localStore.dictionary ?? {h: {}, p: {}};
                        }

                        applyUserDictionary(() => {
                            sortedPatternKeys = Object.keys(dictionary.p).sort((a, b) => b.length - a.length);
                            dictionaryInitialized = true;
                            if (pendingTranslateRequest) setTimeout(() => translateNode(document.body), 300);
                        });
                    }
                }
            }
        });
    };

    const applyUserDictionary = (callback) => {
        chrome.storage.local.get('userDictionary', (result) => {
            const raw = result.userDictionary;
            if (!raw) {
                if (callback) callback();
                return;
            }
            const lines = raw.split('\n');
            for (const line of lines) {
                const [en, kr] = line.split('|').map(v => v.trim());
                if (!en || !kr) continue;
                if (en.includes('+') || en.includes('#')) {
                    dictionary.p[en] = kr;
                } else {
                    dictionary.h[toLowerCase(en)] = kr;
                }
            }
            if (callback) callback();
        });
    };

    const initialize = async () => {
        const url = window.location.href;
        const [syncStore, localStore] = await Promise.all([syncStoragePromise(), localStoragePromise()]);
        const syncData = Object.keys(syncStore).length ? syncStore : syncStorageInit;
        const localData = Object.keys(localStore).length ? localStore : localStorageInit;

        page = getPageUrl(url);
        path = getPathUrl(url);

        autoTranslate = !!(
            syncData.page?.[page] ||
            Object.keys(syncData.path || {}).some(savedPath => url.startsWith(savedPath))
        );

        const version = await versionPromise();
        const localVersion = localData.version ?? -1;

        dictionary = (version > localVersion)
            ? await dictionaryPromise()
            : localData.dictionary ?? {h: {}, p: {}};

        setLocalStorage({version, dictionary, documentCache: {}});

        documentCache = localData.documentCache ?? {};
        documentCacheSize = Object.keys(documentCache).length;

        applyUserDictionary(() => {
            sortedPatternKeys = Object.keys(dictionary.p).sort((a, b) => b.length - a.length);
            dictionaryInitialized = true;

            if (autoTranslate || pendingTranslateRequest) {
                chrome.storage.local.set({forceTabByUrl: true});  // ✅ 새로고침 인식용
                setTimeout(() => translateNode(document.body), 300);
            }
        });
    };

    const waitForChromeOnMessage = (callback, retries = 10) => {
        if (typeof window.chromeOnMessage === 'function') {
            callback();
        } else if (retries > 0) {
            setTimeout(() => waitForChromeOnMessage(callback, retries - 1), 50);
        } else {
            console.warn('chromeOnMessage가 정의되지 않아 기본 핸들러로 대체합니다.');
            window.chromeOnMessage = (handler) => {
                chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
                    handler(msg, sender, sendResponse);
                });
            };
            callback();
        }
    };

    const onTranslateRequest = (callback) => {
        waitForChromeOnMessage(() => {
            chromeOnMessage((message, sender, sendResponse) => {
                if (message.type === 'TRANSLATE_NOW' || message.type === 'TRANSLATE_NOW_FORCE') {
                    if (dictionaryInitialized) {
                        callback();
                        sendResponse({status: 'translated'});
                    } else {
                        pendingTranslateRequest = true;
                        sendResponse({status: 'pending'});
                    }
                }
            });
        });
    };

    (async () => {
        onTranslateRequest(() => translateNode(document.body));
        changeEventListener();
        await initialize();
        observeDocumentChanges();
    })();
})();
