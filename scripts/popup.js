let url = '';
let storage = {};

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


function setTranslate(translate) {
    chrome.storage.local.set({'auto': (translate ? '1' : '0')});
}

function setPage(page, translate) {
    if (!storage['page']) {
        storage['page'] = {};
    }
    storage['page'][page] = translate;
    chrome.storage.sync.set(storage);
}

function setPath(path, translate) {
    if (!storage['path']) {
        storage['path'] = {};
    }
    storage['path'][path] = translate;
    chrome.storage.sync.set(storage);
}

function delAll() {
    storage = {};
    chrome.storage.sync.set(storage);
}

async function initialize() {
    try {
        const tabQueryPromise = new Promise((resolve, reject) => {
            chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                if (tabs && tabs[0]) {
                    resolve(tabs[0].url);
                }
            });
        });

        const storageGetPromise = new Promise((resolve, reject) => {
            chrome.storage.sync.get().then((data) => {
                resolve(data);
            });
        });

        const results = await Promise.all([tabQueryPromise, storageGetPromise]);

        url = results[0];
        storage = results[1];
    } catch (error) {
        console.error('초기화 오류 발생: ', error)
    }
}

$(async function () {
    await initialize();
    const page = getPageUrl(url);
    const path = getPathUrl(url);

    chrome.storage.local.get().then((data) => {
        $('#version').text(data['version']);
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (let [key, {oldValue, newValue}] of Object.entries(changes)) {
            if (namespace === 'local' && key === 'version') {
                $('#version').text(newValue);
            }
        }
    });

    if (!storage['page']) {
        storage['page'] = {};
    }

    if (!storage['path']) {
        storage['path'] = {};
    }

    const isPage = storage['page'][page];
    const isPath = storage['path'][path];
    setTranslate(isPage || isPath);

    if (isPage) {
        $('.addPage').hide();
        $('.addPath').hide();
        $('.delPage').show();
        $('.delPath').hide();
        $('.delAll').show();
    } else if (isPath) {
        $('.addPage').hide();
        $('.addPath').hide();
        $('.delPage').hide();
        $('.delPath').show();
        $('.delAll').show();
    } else {
        $('.addPage').show();
        $('.addPath').show();
        $('.delPage').hide();
        $('.delPath').hide();
        $('.delAll').show();
    }

    $('[name=addPage]').on('click', function () {
        setTranslate(true);
        $('.addPage').hide();
        $('.addPath').hide();
        $('.delPage').show();
        $('.delPath').hide();
        $('.delAll').show();
        setPage(page, true);
    });

    $('[name=addPath]').on('click', function () {
        setTranslate(true);
        $('.addPage').hide();
        $('.addPath').hide();
        $('.delPage').hide();
        $('.delPath').show();
        $('.delAll').show();
        setPath(path, true);
    });

    $('[name=delPage]').on('click', function () {
        setTranslate(false);
        $('.addPage').show();
        $('.addPath').show();
        $('.delPage').hide();
        $('.delPath').hide();
        $('.delAll').show();
        setPage(page, false);
    });

    $('[name=delPath]').on('click', function () {
        setTranslate(false);
        $('.addPage').show();
        $('.addPath').show();
        $('.delPage').hide();
        $('.delPath').hide();
        $('.delAll').show();
        setPath(path, false);
    });

    $('[name=delAll]').on('click', function () {
        setTranslate(false);
        $('.addPage').show();
        $('.addPath').show();
        $('.delPage').hide();
        $('.delPath').hide();
        $('.delAll').show();
        delAll();
    });
});