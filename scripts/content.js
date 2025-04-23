// content.js
(() => {
    let path = '', page = '', cacheVersion = -1;
    let dictionary = {}, documentCache = {}, sortedPatternKeys = [];
    let dictionaryInitialized = false, pendingTranslateRequest = false;
    let isChangedDocument = false, autoTranslate = false;
    let documentCacheSize = 0;

    const regexCache = new Map();
    const translatedNodes = new WeakSet();

    const localStorageInit = {version: -1, dictionary: {h: {}, p: {}}, documentCache: {}};
    const syncStorageInit = {page: {}, path: {}};

    const toLowerCase = text => text?.toLowerCase() ?? text;
    const getPageUrl = url => url.split('?')[0].replace(/\/$/, '');
    const getPathUrl = url => url.split('?')[0].split('/').slice(0, -1).join('/') + '/';
    const getCacheKey = text => text?.toLowerCase().replaceAll(' ', '') ?? text;
    const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isNumericAndSpecialCharactersOnly = str => /^[0-9\s!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]*$/.test(str);

    const getExHashKey = hashKey => {
        const parts = hashKey.split(' - ');
        return parts.length > 1 ? parts[0].trim() : null;
    };

    const getCachedRegex = pattern => {
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
        const setA = new Set(a), setB = new Set(b);
        const common = [...setA].filter(ch => setB.has(ch)).length;
        return common / Math.max(setA.size, setB.size);
    };

    const getDocumentCache = key => documentCache[key] ?? null;

    const storeDocumentLocalCache = (key, value) => {
        isChangedDocument = true;
        if (documentCacheSize > 150000) {
            Object.keys(documentCache).slice(0, 5000).forEach(k => delete documentCache[k]);
            documentCacheSize -= 5000;
        } else {
            documentCacheSize++;
        }
        documentCache[key] = value ?? -1;
    };

    const translateText = text => {
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

        let bestMatch = null, bestScore = 0;
        for (const key of Object.keys(dictionary.p)) {
            if (Math.abs(hashKey.length - key.length) > 5) continue;
            const score = fuzzyScore(hashKey, key);
            if (score > bestScore && score >= 0.8) {
                bestMatch = key;
                bestScore = score;
            }
        }

        return bestMatch ? text.replace(new RegExp(escapeRegExp(bestMatch), 'i'), dictionary.p[bestMatch]) : null;
    };

    const translateNode = node => {
        if (node.nodeType !== 3) return node.childNodes.forEach(translateNode);
        if (translatedNodes.has(node)) return;
        translatedNodes.add(node);

        const raw = node.nodeValue;
        if (!raw || raw.length > 400 || raw.includes('<') || isNumericAndSpecialCharactersOnly(raw)) return;

        const key = getCacheKey(raw);
        const cached = getDocumentCache(key);
        if (cached === -1) return;
        if (cached) return node.nodeValue = cached;

        const translated = translateText(raw);
        if (translated) {
            node.nodeValue = translated;
            storeDocumentLocalCache(key, translated);
        } else {
            storeDocumentLocalCache(key);
        }
    };

    const observeDocumentChanges = () => {
        const observer = new MutationObserver(mutations => {
            if (!autoTranslate) return;
            mutations.forEach(m => m.addedNodes.forEach(node => {
                if (node.nodeType === 1 || node.nodeType === 3) translateNode(node);
            }));
        });
        observer.observe(document.body, {childList: true, subtree: true});
    };

    const applyUserDictionary = (callback) => {
        chrome.storage.local.get('userDictionary', (result) => {
            const raw = result.userDictionary;
            if (!raw) return callback?.();

            raw.split('\n').forEach(line => {
                const [en, kr] = line.split('|').map(v => v.trim());
                if (!en || !kr) return;
                if (en.includes('+') || en.includes('#')) dictionary.p[en] = kr;
                else dictionary.h[toLowerCase(en)] = kr;
            });
            callback?.();
        });
    };

    const fetchVersion = () => fetch('https://mytechnic.github.io/translate/poe_kr_version.json').then(res => res.json()).then(d => d.version);
    const fetchDictionary = () => fetch('https://mytechnic.github.io/translate/poe_kr.json').then(res => res.json());
    const getLocalStorage = () => chrome.storage.local.get();
    const getSyncStorage = () => chrome.storage.sync.get();
    const setLocalStorage = data => chrome.storage.local.set(data);

    const initialize = async () => {
        const url = window.location.href;
        const [syncStore, localStore] = await Promise.all([getSyncStorage(), getLocalStorage()]);
        const syncData = Object.keys(syncStore).length ? syncStore : syncStorageInit;
        const localData = Object.keys(localStore).length ? localStore : localStorageInit;

        page = getPageUrl(url);
        path = getPathUrl(url);

        autoTranslate = !!(syncData.page?.[page] || Object.keys(syncData.path || {}).some(p => url.startsWith(p)));

        const localVersion = localData.version ?? -1;
        try {
            const remoteVersion = await fetchVersion();
            if (remoteVersion > localVersion) {
                dictionary = await fetchDictionary();
                await setLocalStorage({version: remoteVersion, dictionary, documentCache: {}});
            } else {
                dictionary = localData.dictionary ?? {h: {}, p: {}};
            }
        } catch (e) {
            dictionary = localData.dictionary ?? {h: {}, p: {}};
        }

        documentCache = localData.documentCache ?? {};
        documentCacheSize = Object.keys(documentCache).length;

        applyUserDictionary(() => {
            sortedPatternKeys = Object.keys(dictionary.p).sort((a, b) => b.length - a.length);
            dictionaryInitialized = true;
            if (autoTranslate || pendingTranslateRequest) {
                chrome.storage.local.set({forceTabByUrl: true});
                setTimeout(() => translateNode(document.body), 300);
            }
        });
    };

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'TRANSLATE_NOW' || message.type === 'TRANSLATE_NOW_FORCE') {
            if (dictionaryInitialized) {
                translateNode(document.body);
                sendResponse({status: 'translated'});
            } else {
                pendingTranslateRequest = true;
                sendResponse({status: 'pending'});
            }
        }
    });

    (async () => {
        chrome.storage.onChanged.addListener(async (changes, namespace) => {
            if (namespace === 'sync' && (changes.page || changes.path)) {
                autoTranslate = true;
                const localStore = await getLocalStorage();
                const localVersion = localStore.version ?? -1;
                try {
                    const remoteVersion = await fetchVersion();
                    if (remoteVersion > localVersion) {
                        dictionary = await fetchDictionary();
                        await setLocalStorage({version: remoteVersion, dictionary, documentCache: {}});
                    } else {
                        dictionary = localStore.dictionary ?? {h: {}, p: {}};
                    }
                } catch (e) {
                    dictionary = localStore.dictionary ?? {h: {}, p: {}};
                }

                applyUserDictionary(() => {
                    sortedPatternKeys = Object.keys(dictionary.p).sort((a, b) => b.length - a.length);
                    dictionaryInitialized = true;
                    if (pendingTranslateRequest) setTimeout(() => translateNode(document.body), 300);
                });
            }
        });

        await initialize();
        observeDocumentChanges();
    })();
})();
