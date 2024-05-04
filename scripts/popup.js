let isPageTranslate = false;
let isPathTranslate = false;
let path = '';
let page = '';
let cacheVersion = -1;
let bookmark = {};

function setTranslate(translate) {
    setLocalStorage({'auto': (translate ? '1' : '0')});
}

function setPage(translate) {
    if (!bookmark['page']) {
        bookmark['page'] = {};
    }

    bookmark['page'][page] = translate;
    setSyncStorage(bookmark);
}

function setPath(translate) {
    if (!bookmark['path']) {
        bookmark['path'] = {};
    }
    bookmark['path'][path] = translate;
    setSyncStorage(bookmark);
}

function delAll() {
    clearSyncStorage();
}

function changeEventListener() {
    onChangeStorage((changes, namespace) => {
        for (let [key, {oldValue, newValue}] of Object.entries(changes)) {
            if (namespace === 'local' && key === 'version') {
                $('#version').text(newValue);
            }
        }
    });
}

async function initialize() {
    let [tabs, localStorage, syncStorage] = await Promise.all([
        tabsPromise(),
        localStoragePromise(),
        syncStoragePromise()
    ]);

    let currentUrl = '';
    if (tabs && tabs[0]) {
        currentUrl = tabs[0].url;
    }
    if (!localStorage || Object.keys(localStorage).length === 0) {
        localStorage = {'version': -1, 'dictionary': {'h': {}, 'p': {}}, 'documentCache': {}};
    }
    if (!syncStorage || Object.keys(syncStorage).length === 0) {
        syncStorage = {'page': {}, 'path': {}, 'auto': '0'};
    }

    bookmark = syncStorage;
    page = getPageUrl(currentUrl);
    path = getPathUrl(currentUrl);
    isPageTranslate = syncStorage['page'][page] || false;
    isPathTranslate = syncStorage['path'][path] || false;
    cacheVersion = localStorage['version'];

    $('#version').text(cacheVersion);
}

$(async function () {
    await changeEventListener();
    await initialize();

    if (isPageTranslate) {
        $('.addPage').hide();
        $('.addPath').hide();
        $('.delPage').show();
        $('.delPath').hide();
        $('.delAll').show();
    } else if (isPathTranslate) {
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

    $('button[name=addPage]').on('click', function () {
        $('.addPage').hide();
        $('.addPath').hide();
        $('.delPage').show();
        $('.delPath').hide();
        $('.delAll').show();
        setTranslate(true);
        setPage(true);
    });

    $('button[name=addPath]').on('click', function () {
        $('.addPage').hide();
        $('.addPath').hide();
        $('.delPage').hide();
        $('.delPath').show();
        $('.delAll').show();
        setTranslate(true);
        setPath(true);
    });

    $('button[name=delPage]').on('click', function () {
        $('.addPage').show();
        $('.addPath').show();
        $('.delPage').hide();
        $('.delPath').hide();
        $('.delAll').show();
        setTranslate(false);
        setPage(false);
    });

    $('button[name=delPath]').on('click', function () {
        $('.addPage').show();
        $('.addPath').show();
        $('.delPage').hide();
        $('.delPath').hide();
        $('.delAll').show();
        setTranslate(false);
        setPath(false);
    });

    $('button[name=delAll]').on('click', function () {
        $('.addPage').show();
        $('.addPath').show();
        $('.delPage').hide();
        $('.delPath').hide();
        $('.delAll').show();
        setTranslate(false);
        delAll();
    });
});