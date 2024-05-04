let path = '';
let page = '';
let cacheVersion = -1;
let dictionary = {};
let dictionaryInitialized = false;
let isInProgressTranslating = false;
let isChangedDocument = false;
let autoTranslate = false;
let documentCache = {};
let documentCacheSize = 0;
let localStorageInit = {'version': -1, 'dictionary': {'h': {}, 'p': {}}, 'documentCache': {}};
let syncStorageInit = {'page': {}, 'path': {}, 'auto': '0'};

function toLowerCase(text) {
    if (text == null) {
        return text;
    }
    return text.toLowerCase();
}

function getCacheKey(text) {
    if (text == null) {
        return text;
    }
    return text.toLowerCase().replaceAll(' ', '');
}

function getExHashKey(hashKey) {
    let z = hashKey.split(' - ');
    if (z.length > 1) {
        return z[0].trim();
    } else {
        return null;
    }
}

function translateText(source) {
    let word = source.trim();
    let hashKey = toLowerCase(word);
    let exHashKey = getExHashKey(hashKey);
    let findText = '';

    if (dictionary['h'][hashKey]) {
        findText = source.replaceAll(word, dictionary['h'][hashKey]);
    } else if (dictionary['p'][hashKey]) {
        findText = source.replaceAll(word, dictionary['p'][hashKey]);
    }

    if (!findText && exHashKey) {
        if (dictionary['h'][exHashKey]) {
            findText = source.replace(new RegExp(exHashKey, 'i'), dictionary['h'][exHashKey]);
        } else if (dictionary['p'][exHashKey]) {
            findText = source.replace(new RegExp(exHashKey, 'i'), dictionary['p'][exHashKey]);
        }
    }

    if (!findText) {
        for (let key in dictionary['p']) {
            findText = regexTranslate(source, key, dictionary['p'][key]);
            if (findText) {
                break;
            }
        }
    }

    if (findText) {
        return findText;
    }

    return null;
}

function regexTranslate(text, source, target) {
    const pattern = source.replace(/\+/g, '\\+').replace(/#/g, '(\\d+)');
    const regex = new RegExp(pattern, 'i');
    const matched = text.trim().match(regex);
    if (matched) {
        for (let i = 1; i < matched.length; i++) {
            target = target.replace(/#/, matched[i]);
        }
        text = target.replace(regex, target);
        return text;
    }
}

function isNumericAndSpecialCharactersOnly(str) {
    return /^[0-9\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]*$/.test(str);
}

function translate(node) {
    if (node.nodeType === 3) {
        if (!node.nodeValue
            || node.nodeValue.length > 400
            || node.nodeValue.indexOf('<') > -1
            || isNumericAndSpecialCharactersOnly(node.nodeValue)) {
            return;
        }

        let cacheKey = getCacheKey(node.nodeValue);
        let cacheValue = getDocumentCache(cacheKey);

        if (cacheValue === -1) {
            return;
        } else if (cacheValue) {
            node.nodeValue = cacheValue;
            return;
        }

        let text = translateText(node.nodeValue);
        if (text) {
            node.nodeValue = text;
            storeDocumentLocalCache(cacheKey, text);
        } else {
            storeDocumentLocalCache(cacheKey);
        }
    }

    node.childNodes.forEach(child => {
        translate(child);
    });
}

function translateTask(sDebug) {
    if (!dictionaryInitialized) {
        return;
    }

    if (isInProgressTranslating) {
        return;
    }

    if (!autoTranslate) {
        return;
    }

    isInProgressTranslating = true;
    isChangedDocument = false;
    translate(document.body);
    if (isChangedDocument) {
        setLocalStorage({'documentCache': documentCache});
    }
    isChangedDocument = false;
    isInProgressTranslating = false;
}

function getDocumentCache(cacheKey) {
    return documentCache[cacheKey] || null;
}

function storeDocumentLocalCache(cacheKey, value) {
    isChangedDocument = true;
    if (documentCacheSize > 150000) {
        let keys = Object.keys(documentCache);
        keys.slice(0, 5000).forEach(function (key) {
            delete documentCache[key];
            documentCacheSize--;
        });
    } else {
        documentCacheSize++;
    }
    documentCache[cacheKey] = value || -1;
}

async function changeEventListener() {
    onChangeStorage(async (changes, namespace) => {
        for (let [key, {oldValue, newValue}] of Object.entries(changes)) {
            if (namespace === 'local' && key === 'auto') {
                autoTranslate = newValue === '1';
                if (autoTranslate) {
                    let [version, localStorage,] = await Promise.all([
                        versionPromise(), localStoragePromise()
                    ]);
                    const localVersion = localStorage['version'] || -1;

                    if (version > localVersion) {
                        dictionary = await dictionaryPromise();
                        setLocalStorage({
                            'version': version,
                            'dictionary': dictionary,
                            'documentCache': {}
                        });
                    }

                    cacheVersion = version;
                    setLocalStorage({'documentCache': {}});
                    dictionaryInitialized = true;
                }
            }
        }
    });
}

async function initialize() {
    let url = window.location.href;
    let [syncStorage, localStorage,] = await Promise.all([
        syncStoragePromise(), localStoragePromise()
    ]);
    if (!syncStorage || Object.keys(syncStorage).length === 0) {
        syncStorage = syncStorageInit;
    }
    if (!localStorage || Object.keys(localStorage).length === 0) {
        localStorage = localStorageInit;
    }

    page = getPageUrl(url);
    path = getPathUrl(url);
    autoTranslate = !!(syncStorage['page'][page] || syncStorage['path'][path]);
    dictionary = localStorage['dictionary'] || {'p': {}, 'h': {}};
    documentCache = localStorage['documentCache'] || {};
    documentCacheSize = Object.keys(documentCache).length;
    if (autoTranslate) {
        dictionaryInitialized = true;
    }
}

let counter = 0;

function translateExecutor() {
    translateTask();

    let timeout = 300;
    if (counter === 0) {
        timeout = 1500;
    } else if (counter < 3) {
        timeout = 1000;
    }
    setTimeout(translateExecutor, timeout);
    counter += 1;
}

$(async function () {
    await changeEventListener();
    await initialize();

    translateExecutor();
});