// popup.js

(() => {
    let isPageTranslate = false;
    let isPathTranslate = false;
    let currentPath = '';
    let currentPage = '';
    let cacheVersion = -1;
    let bookmark = {};

    function setPage(translate) {
        bookmark.page = bookmark.page || {};
        bookmark.page[currentPage] = translate;
        setSyncStorage(bookmark);
        chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'}, (response) => {
            console.log('[popup.js] SENT: TRANSLATE_NOW_FORCE → response:', response);
        });
    }

    function setPath(translate) {
        bookmark.path = bookmark.path || {};
        bookmark.path[currentPath] = translate;
        setSyncStorage(bookmark);
        chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'}, (response) => {
            console.log('[popup.js] SENT: TRANSLATE_NOW_FORCE → response:', response);
        });
    }

    function delAll() {
        clearSyncStorage();
        chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'}, (response) => {
            console.log('[popup.js] SENT: TRANSLATE_NOW_FORCE (delAll) → response:', response);
        });
    }

    function updateVersionText(version) {
        $('#version').text(version);
    }

    function applyButtonState() {
        $('.addPage, .addPath, .delPage, .delPath').hide();
        if (isPageTranslate) {
            $('.delPage').show();
        } else if (isPathTranslate) {
            $('.delPath').show();
        } else {
            $('.addPage, .addPath').show();
        }
        $('.delAll').show();
    }

    function registerButtonEvents() {
        $('button[name=addPage]').on('click', () => {
            isPageTranslate = true;
            setPage(true);
            applyButtonState();
        });

        $('button[name=addPath]').on('click', () => {
            isPathTranslate = true;
            setPath(true);
            applyButtonState();
        });

        $('button[name=delPage]').on('click', () => {
            isPageTranslate = false;
            setPage(false);
            applyButtonState();
        });

        $('button[name=delPath]').on('click', () => {
            isPathTranslate = false;
            setPath(false);
            applyButtonState();
        });

        $('button[name=delAll]').on('click', () => {
            isPageTranslate = false;
            isPathTranslate = false;
            delAll();
            applyButtonState();
        });
    }

    function changeEventListener() {
        onChangeStorage((changes, namespace) => {
            if (namespace === 'local' && changes.version) {
                updateVersionText(changes.version.newValue);
            }
        });
    }

    async function initialize() {
        try {
            const [tabs, localStorage, syncStorage] = await Promise.all([
                tabsPromise(),
                localStoragePromise(),
                syncStoragePromise()
            ]);

            const url = (tabs && tabs[0] && tabs[0].url) || '';
            bookmark = syncStorage || {page: {}, path: {}, autoTranslate: false};
            currentPage = getPageUrl(url);
            currentPath = getPathUrl(url);
            isPageTranslate = !!(bookmark.page && bookmark.page[currentPage]);
            isPathTranslate = !!(bookmark.path && bookmark.path[currentPath]);
            const version = (localStorage && localStorage.version) || -1;
            cacheVersion = version;
            updateVersionText(cacheVersion);
        } catch (error) {
            console.error('초기화 실패:', error);
        }
    }

    $(async function () {
        changeEventListener();
        await initialize();
        applyButtonState();
        registerButtonEvents();
    });
})();
