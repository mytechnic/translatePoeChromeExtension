// popup.js

(() => {
    let isPageTranslate = false;
    let isPathTranslate = false;
    let currentPath = '';
    let currentPage = '';
    let cacheVersion = -1;
    let bookmark = {};

    // ✅ 추가된 함수: chrome.storage 변경 감지 리스너
    function onChangeStorage(callback) {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            callback(changes, namespace);
        });
    }

    function setPage(translate) {
        bookmark.page = bookmark.page || {};
        bookmark.page[currentPage] = translate;
        setSyncStorage(bookmark);
        chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'});
    }

    function setPath(translate) {
        bookmark.path = bookmark.path || {};
        bookmark.path[currentPath] = translate;
        setSyncStorage(bookmark);
        chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'});
    }

    function delAll() {
        clearSyncStorage();
        chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'});
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
            renderTabLists();
            $('#tab-page').trigger('click'); // ✅ 탭 전환
        });

        $('button[name=addPath]').on('click', () => {
            isPathTranslate = true;
            setPath(true);
            applyButtonState();
            renderTabLists();
            $('#tab-path').trigger('click'); // ✅ 탭 전환
        });

        $('button[name=delPage]').on('click', () => {
            isPageTranslate = false;
            setPage(false);
            applyButtonState();
            renderTabLists();
        });

        $('button[name=delPath]').on('click', () => {
            isPathTranslate = false;
            setPath(false);
            applyButtonState();
            renderTabLists();
        });

        $('button[name=delAll]').on('click', () => {
            isPageTranslate = false;
            isPathTranslate = false;
            delAll();
            applyButtonState();
            $('#content-page').html('<p>저장된 페이지가 없습니다.</p>');
            $('#content-path').html('<p>저장된 경로가 없습니다.</p>');
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
            renderTabLists();
        } catch (error) {
            console.error('초기화 실패:', error);
        }
    }

    function renderTabLists() {
        renderList($('#content-page'), bookmark.page, 'page');
        renderList($('#content-path'), bookmark.path, 'path');
    }

    function renderList($target, data, key) {
        $target.empty();

        if (!data || Object.keys(data).length === 0) {
            $target.append(`<p>저장된 ${key === 'page' ? '페이지' : '경로'}가 없습니다.</p>`);
            return;
        }

        const $ul = $('<ul></ul>');
        const urls = Object.keys(data);
        const currentUrl = key === 'page' ? currentPage : currentPath;

        urls.sort((a, b) => {
            if (a === currentUrl) return -1;
            if (b === currentUrl) return 1;
            return 0;
        });

        urls.forEach((url) => {
            const $li = $('<li></li>');
            const $span = $('<span></span>').text(url);
            const $btn = $('<button class="delete-btn" title="삭제">✕</button>').data({key, url});

            $btn.on('click', () => {
                delete bookmark[key][url];
                setSyncStorage(bookmark);

                if (key === 'page' && url === currentPage) {
                    isPageTranslate = false;
                }
                if (key === 'path' && url === currentPath) {
                    isPathTranslate = false;
                }

                applyButtonState();
                $li.remove();
                chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'});
            });

            $li.append($span).append($btn);
            $ul.append($li);
        });

        $target.append($ul);
    }

    function registerTabEvents() {
        $('#tab-page').on('click', () => {
            $('#tab-page').addClass('active');
            $('#tab-path').removeClass('active');
            $('#content-page').removeClass('hidden');
            $('#content-path').addClass('hidden');
        });

        $('#tab-path').on('click', () => {
            $('#tab-path').addClass('active');
            $('#tab-page').removeClass('active');
            $('#content-path').removeClass('hidden');
            $('#content-page').addClass('hidden');
        });

        if (isPathTranslate) {
            $('#tab-path').trigger('click');
        } else {
            $('#tab-page').trigger('click');
        }
    }

    $(async function () {
        changeEventListener();
        await initialize();
        applyButtonState();
        registerButtonEvents();
        registerTabEvents();
    });
})();
