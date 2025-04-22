// content.js

(() => {
    console.log('[content.js] Loaded into page');

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
    const localStorageInit = {version: -1, dictionary: {h: {}, p: {}}, documentCache: {}};
    const syncStorageInit = {page: {}, path: {}};
    const translatedNodes = new WeakSet();

    const toLowerCase = (text) => text?.toLowerCase() ?? text;
    const getCacheKey = (text) => text?.toLowerCase().replaceAll(' ', '') ?? text;
    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isNumericAndSpecialCharactersOnly = (str) =>
        /^[0-9\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]*$/.test(str);

    const getPageUrl = (url) => {
        let page = url.split('?')[0];
        return page.endsWith('/') ? page.slice(0, -1) : page;
    };

    const getPathUrl = (url) => {
        if (url.startsWith('https://poe.ninja/builds/necropolis/character/'))
            return 'https://poe.ninja/builds/necropolis/character/';
        if (url.startsWith('https://poe.ninja/builds/streamers/character/'))
            return 'https://poe.ninja/builds/streamers/character/';
        return url.endsWith('/') ? url : url.split('/').slice(0, -1).join('/') + '/';
    };

    const getExHashKey = (hashKey) => {
        const parts = hashKey.split(' - ');
        return parts.length > 1 ? parts[0].trim() : null;
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
        const common = [...setA].filter((ch) => setB.has(ch)).length;
        return common / Math.max(setA.size, setB.size);
    };

    function translateText(text) {
        const word = text.trim();
        const hashKey = toLowerCase(word);
        const exHashKey = getExHashKey(hashKey);

        if (dictionary.h[hashKey]) return text.replaceAll(word, dictionary.h[hashKey]);
        if (dictionary.p[hashKey]) return text.replaceAll(word, dictionary.p[hashKey]);

        if (exHashKey) {
            if (dictionary.h[exHashKey])
                return text.replace(new RegExp(exHashKey, 'i'), dictionary.h[exHashKey]);
            if (dictionary.p[exHashKey])
                return text.replace(new RegExp(exHashKey, 'i'), dictionary.p[exHashKey]);
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
    }

    function translateNode(node) {
        if (node.nodeType !== 3) {
            node.childNodes.forEach(translateNode);
            return;
        }
        if (translatedNodes.has(node)) return;
        translatedNodes.add(node);

        if (node.parentElement?.dataset?.translated === 'true') return;
        node.parentElement?.setAttribute('data-translated', 'true');

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
    }

    function observeDocumentChanges() {
        const observer = new MutationObserver((mutations) => {
            if (!autoTranslate) return; // ✅ 번역이 꺼진 경우 무시
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 || node.nodeType === 3) {
                        translateNode(node);
                    }
                });
            }
        });
        observer.observe(document.body, {childList: true, subtree: true});
    }

    function changeEventListener() {
        onChangeStorage(async (changes, namespace) => {
            for (const [key, {newValue}] of Object.entries(changes)) {
                if (namespace === 'sync' && (key === 'page' || key === 'path')) {
                    autoTranslate = newValue;
                    if (autoTranslate) {
                        const [version, localStore] = await Promise.all([
                            versionPromise(),
                            localStoragePromise(),
                        ]);
                        const localVersion = localStore.version ?? -1;

                        if (version > localVersion) {
                            dictionary = await dictionaryPromise();
                            setLocalStorage({version, dictionary, documentCache: {}});
                        }
                        cacheVersion = version;
                        sortedPatternKeys = Object.keys(dictionary.p).sort((a, b) => b.length - a.length);
                    }
                    dictionaryInitialized = true;

                    // ✅ 사전 로딩 후 대기 중이던 번역 요청 처리
                    if (pendingTranslateRequest) {
                        setTimeout(() => {
                            console.log('[changeEventListener] 요청 감지 후 번역 실행');
                            translateNode(document.body);
                        }, 500);
                    }
                }
            }
        });
    }

    async function initialize() {
        const url = window.location.href;
        const [syncStore, localStore] = await Promise.all([
            syncStoragePromise(),
            localStoragePromise()
        ]);

        const syncData = Object.keys(syncStore).length ? syncStore : syncStorageInit;
        const localData = Object.keys(localStore).length ? localStore : localStorageInit;

        page = getPageUrl(url);
        path = getPathUrl(url);

        const syncPages = syncData.page ?? {};
        const syncPaths = syncData.path ?? {};
        autoTranslate = !!(syncPages[page] || syncPaths[path]);

        const version = await versionPromise();
        const localVersion = localData.version ?? -1;

        if (version > localVersion || !localData.dictionary) {
            dictionary = await dictionaryPromise();
            setLocalStorage({version, dictionary, documentCache: {}});
        } else {
            dictionary = localData.dictionary;
        }

        documentCache = localData.documentCache ?? {};
        documentCacheSize = Object.keys(documentCache).length;
        sortedPatternKeys = Object.keys(dictionary.p).sort((a, b) => b.length - a.length);

        if (autoTranslate) {
            dictionaryInitialized = true;
            setTimeout(() => {
                console.log('[initialize] 자동 번역 실행');
                translateNode(document.body);
            }, 500);
        }

        // ✅ 혹시 번역 요청이 이미 대기 중이었다면 즉시 실행
        if (pendingTranslateRequest && !dictionaryInitialized) {
            dictionaryInitialized = true;
            setTimeout(() => {
                console.log('[initialize] 대기 요청 번역 실행');
                translateNode(document.body);
            }, 500);
        }
    }

    function onTranslateRequest(callback) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'TRANSLATE_NOW' || message.type === 'TRANSLATE_NOW_FORCE') {
                console.log('[content.js] 번역 요청 수신');

                if (dictionaryInitialized) {
                    callback();
                    sendResponse({status: 'translated'});
                } else {
                    pendingTranslateRequest = true;
                    sendResponse({status: 'pending'});
                }
            }
        });
    }

    $(async function () {
        onTranslateRequest(() => translateNode(document.body));
        changeEventListener();
        await initialize();
        observeDocumentChanges();
    });
})();
