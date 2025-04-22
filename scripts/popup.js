// ✅ jquery-free popup.js
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
        document.getElementById('version').textContent = version;
    }

    function applyButtonState() {
        const show = (selector) => document.querySelector(selector).style.display = '';
        const hide = (selector) => document.querySelector(selector).style.display = 'none';

        hide('.addPage');
        hide('.addPath');
        hide('.delPage');
        hide('.delPath');

        if (isPageTranslate) show('.delPage');
        else if (isPathTranslate) show('.delPath');
        else {
            show('.addPage');
            show('.addPath');
        }

        show('.delAll');
    }

    function registerButtonEvents() {
        document.querySelector('button[name=addPage]').addEventListener('click', () => {
            isPageTranslate = true;
            setPage(true);
            applyButtonState();
            renderTabLists();
            document.getElementById('tab-page').click();
        });

        document.querySelector('button[name=addPath]').addEventListener('click', () => {
            isPathTranslate = true;
            setPath(true);
            applyButtonState();
            renderTabLists();
            document.getElementById('tab-path').click();
        });

        document.querySelector('button[name=delPage]').addEventListener('click', () => {
            isPageTranslate = false;
            setPage(false);
            applyButtonState();
            renderTabLists();
        });

        document.querySelector('button[name=delPath]').addEventListener('click', () => {
            isPathTranslate = false;
            setPath(false);
            applyButtonState();
            renderTabLists();
        });

        document.querySelector('button[name=delAll]').addEventListener('click', () => {
            isPageTranslate = false;
            isPathTranslate = false;
            delAll();
            applyButtonState();
            document.getElementById('content-page').innerHTML = '<p>저장된 페이지가 없습니다.</p>';
            document.getElementById('content-path').innerHTML = '<p>저장된 경로가 없습니다.</p>';
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
        renderList(document.getElementById('content-page'), bookmark.page, 'page');
        renderList(document.getElementById('content-path'), bookmark.path, 'path');
    }

    function renderList(container, data, key) {
        container.innerHTML = '';

        if (!data || Object.keys(data).length === 0) {
            container.innerHTML = `<p>저장된 ${key === 'page' ? '페이지' : '경로'}가 없습니다.</p>`;
            return;
        }

        const ul = document.createElement('ul');
        const urls = Object.keys(data);
        const currentUrl = key === 'page' ? currentPage : currentPath;

        urls.sort((a, b) => (a === currentUrl ? -1 : b === currentUrl ? 1 : 0));

        urls.forEach((url) => {
            const li = document.createElement('li');
            const span = document.createElement('span');
            span.textContent = url;
            const btn = document.createElement('button');
            btn.className = 'delete-btn';
            btn.title = '삭제';
            btn.textContent = '✕';

            btn.addEventListener('click', () => {
                delete bookmark[key][url];
                setSyncStorage(bookmark);

                if (key === 'page' && url === currentPage) isPageTranslate = false;
                if (key === 'path' && url === currentPath) isPathTranslate = false;

                applyButtonState();
                li.remove();
                chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'});
            });

            li.appendChild(span);
            li.appendChild(btn);
            ul.appendChild(li);
        });

        container.appendChild(ul);
    }

    function registerTabEvents() {
        const tabPage = document.getElementById('tab-page');
        const tabPath = document.getElementById('tab-path');
        const contentPage = document.getElementById('content-page');
        const contentPath = document.getElementById('content-path');

        tabPage.addEventListener('click', () => {
            tabPage.classList.add('active');
            tabPath.classList.remove('active');
            contentPage.classList.remove('hidden');
            contentPath.classList.add('hidden');
        });

        tabPath.addEventListener('click', () => {
            tabPath.classList.add('active');
            tabPage.classList.remove('active');
            contentPath.classList.remove('hidden');
            contentPage.classList.add('hidden');
        });

        (isPathTranslate ? tabPath : tabPage).click();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        changeEventListener();
        await initialize();
        applyButtonState();
        registerButtonEvents();
        registerTabEvents();
    });
})();
