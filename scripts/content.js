let version = {};
let dictionary = {};
let isInProgressTranslating = false;
let autoTranslate = false;
let documentTextCache = {};
let allInitialized = false;
let cacheInitialized = false;
let syncInitialized = false;
let url = window.location.href;

function getPageUrl(url) {
    let cleanUrl = url.split('?')[0];

    if (cleanUrl.endsWith('/')) {
        cleanUrl = cleanUrl.slice(0, -1);
    }

    return cleanUrl;
}

function getPathUrl(url) {
    const urlObject = new URL(url);

    const pathParts = urlObject.pathname.split('/').filter(part => part !== '');
    const parentPath = pathParts.slice(0, -1).join('/') + '/';

    if (url.endsWith('/')) {
        return url;
    }

    return parentPath;
}

function cacheStorage() {
    let c = new Promise(function (resolve, reject) {
        chrome.storage.local.get().then((data) => {
            version = data['version'];
            dictionary = data['dictionary'];
            cacheInitialized = true;
            allInitialized = cacheInitialized && syncInitialized;
        });
    });
}

async function syncStorage() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (let [key, {oldValue, newValue}] of Object.entries(changes)) {
            if (namespace === 'local' && key === 'auto') {
                autoTranslate = newValue === '1';
            }
        }
    });

    let c = new Promise(function (resolve, reject) {
        chrome.storage.sync.get().then((storage) => {
            const page = getPageUrl(url);
            const path = getPathUrl(url);

            if (!storage['page']) {
                storage['page'] = {};
            }

            if (!storage['path']) {
                storage['path'] = {};
            }

            autoTranslate = !!(storage['page'][page] || storage['path'][path]);
            syncInitialized = true;
            allInitialized = cacheInitialized && syncInitialized;
        });
    });
}

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

function translate(node) {
    if (node.nodeType === 3) {
        if (!node.nodeValue) {
            return;
        }

        let cacheKey = getCacheKey(node.nodeValue);

        if (documentTextCache[cacheKey] === -1) {
            return;
        } else if (documentTextCache[cacheKey]) {
            node.nodeValue = documentTextCache[cacheKey];
            return;
        }

        let text = translateText(node.nodeValue);
        if (text) {
            documentTextCache[cacheKey] = text;
            node.nodeValue = text;
        } else {
            documentTextCache[cacheKey] = -1;
        }
    }

    node.childNodes.forEach(child => {
        translate(child);
    });
}

function translateTask(sDebug) {

    if (!allInitialized) {
        return;
    }

    if (isInProgressTranslating) {
        return;
    }

    if (!autoTranslate) {
        return;
    }

    isInProgressTranslating = true;
    translate(document.body);
    isInProgressTranslating = false;
}

async function loadDictionary() {
    await syncStorage();
    await cacheStorage();

    let _version;
    if (dictionary) {
        $.ajax({
            async: false,
            dataType: 'json',
            url: 'https://mytechnic.github.io/translate/poe_kr_version.json',
            success: function (result) {
                _version = result['version'];
                if (_version > version) {
                    version = -1;
                }
            }
        });

        if (version > -1) {
            return;
        }
    }

    $.ajax({
        async: false,
        dataType: 'json',
        url: 'https://mytechnic.github.io/translate/poe_kr.json',
        success: function (result) {
            dictionary = result;
            chrome.storage.local.set({'version': _version, 'dictionary': dictionary});
        }
    });
}

function translateExecutor() {
    isInProgressTranslating = true;
    loadDictionary();
    isInProgressTranslating = false;

    setInterval(function () {
        translateTask();
    }, 300);
}

$(function () {
    translateExecutor();
});