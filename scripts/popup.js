// scripts/popup.js
(() => {
    function activateTab(id) {
        document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
        document.getElementById(`tab-${id}`).classList.add('active');
        document.getElementById(`content-${id}`).classList.remove('hidden');
    }

    let isPageTranslate = false;
    let isPathTranslate = false;
    let currentPage = '';
    let currentPath = '';
    let cacheVersion = -1;
    let bookmark = {};

    function getPageUrl(url) {
        return url.split('?')[0].replace(/\/$/, '');
    }

    function getPathUrl(url) {
        return url.split('?')[0].split('/').slice(0, -1).join('/') + '/';
    }

    function isMatchPage(url) {
        const page = getPageUrl(url);
        return !!bookmark.page?.[page];
    }

    function isMatchPath(url) {
        return Object.keys(bookmark.path || {}).some(p => url.startsWith(p));
    }

    const updateTranslationState = () => {
        const pageUrl = getPageUrl(location.href);
        const pathUrl = getPathUrl(location.href);

        isPageTranslate = !!bookmark.page?.[pageUrl] || Object.keys(bookmark.page || {}).some(p => pageUrl.startsWith(p));
        isPathTranslate = Object.keys(bookmark.path || {}).some(p => location.href.startsWith(p));

        // 상태 갱신 후 로그 출력
        console.log('isPageTranslate:', isPageTranslate);
        console.log('isPathTranslate:', isPathTranslate);

        renderStatus();
        renderTabLists();
        applyButtonState();
    };

    function setPage(translate) {
        bookmark.page = bookmark.page || {};
        if (translate) bookmark.page[currentPage] = true;
        else delete bookmark.page[currentPage];
        setSyncStorage(bookmark);
        chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'});
        chrome.storage.local.set({forceTabByUrl: true});

        updateTranslationState();  // 상태 업데이트
    }

    function setPath(translate) {
        bookmark.path = bookmark.path || {};
        if (translate) bookmark.path[currentPath] = true;
        else delete bookmark.path[currentPath];
        setSyncStorage(bookmark);
        chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'});
        chrome.storage.local.set({forceTabByUrl: true});

        updateTranslationState();  // 상태 업데이트
    }

    function renderStatus() {
        const statusEl = document.getElementById('auto-translate-status');
        if (isPageTranslate || isPathTranslate) {
            statusEl.textContent = '🟢 이 페이지는 번역 중입니다';
            statusEl.className = 'status on';
        } else {
            statusEl.textContent = '🔴 이 페이지는 아직 번역되지 않았어요';
            statusEl.className = 'status off';
        }
    }

    function renderTabLists() {
        renderList('content-page', bookmark.page, 'page');
        renderList('content-path', bookmark.path, 'path');
    }

    function renderList(containerId, data, key) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        if (!data || Object.keys(data).length === 0) {
            container.innerHTML = `<p>저장된 ${key === 'page' ? '페이지' : '경로'}가 없습니다.</p>`;
            return;
        }

        const ul = document.createElement('ul');
        Object.keys(data).forEach(url => {
            const li = document.createElement('li');
            li.textContent = url;

            const btn = document.createElement('button');
            btn.textContent = '✕';
            btn.className = 'delete-btn';
            btn.onclick = () => {
                delete bookmark[key][url];
                setSyncStorage(bookmark);

                // URL 삭제 후 상태 업데이트
                updateTranslationState();
                chrome.runtime.sendMessage({type: 'TRANSLATE_NOW_FORCE'});
            };

            li.appendChild(btn);
            ul.appendChild(li);
        });
        container.appendChild(ul);
    }

    function applyButtonState() {
        const show = id => document.querySelector(id).style.display = '';
        const hide = id => document.querySelector(id).style.display = 'none';

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

        renderStatus();
    }

    function bindEvents() {
        document.querySelector('button[name=addPage]').onclick = () => {
            isPageTranslate = true;
            setPage(true);
            applyButtonState();
            renderTabLists();
            activateTab('page');
        };

        document.querySelector('button[name=addPath]').onclick = () => {
            isPathTranslate = true;
            setPath(true);
            applyButtonState();
            renderTabLists();
            activateTab('path');
        };

        document.querySelector('button[name=delPage]').onclick = () => {
            isPageTranslate = false;
            setPage(false);
            applyButtonState();
            renderTabLists();
        };

        document.querySelector('button[name=delPath]').onclick = () => {
            isPathTranslate = false;
            setPath(false);
            applyButtonState();
            renderTabLists();
        };

        document.getElementById('save-dictionary').onclick = () => {
            const raw = document.getElementById('dictionary-editor').value;
            chrome.storage.local.set({userDictionary: raw});
            alert('사용자 사전이 저장되었습니다.');
        };

        document.getElementById('reset-all').onclick = () => {
            const confirmMsg = '정말 초기화하시겠어요? 저장된 설정과 단어장이 삭제됩니다.';
            if (confirm(confirmMsg)) {
                chrome.storage.local.clear();
                setSyncStorage({page: {}, path: {}});
                document.getElementById('dictionary-editor').value = '';

                // 상태 갱신 후 호출
                updateTranslationState();
            }
        };

        ['page', 'path', 'dictionary', 'settings'].forEach(name => {
            const tab = document.getElementById(`tab-${name}`);
            const content = document.getElementById(`content-${name}`);
            tab.onclick = () => {
                document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
                tab.classList.add('active');
                content.classList.remove('hidden');
                chrome.storage.local.set({lastTab: name});
            };
        });
    }

    async function init() {
        const [tabs, local, sync] = await Promise.all([
            tabsPromise(), localStoragePromise(), syncStoragePromise()
        ]);
        const url = tabs?.[0]?.url || '';

        currentPage = getPageUrl(url);
        currentPath = getPathUrl(url);
        bookmark = sync || {page: {}, path: {}};
        isPageTranslate = isMatchPage(url);
        isPathTranslate = isMatchPath(url);
        cacheVersion = local.version || -1;

        document.getElementById('version').textContent = cacheVersion;
        chrome.storage.local.get('userDictionary', result => {
            document.getElementById('dictionary-editor').value = result.userDictionary || '';
        });

        renderStatus();
        applyButtonState();
        renderTabLists();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        bindEvents();
        await init();
        chrome.storage.local.get(['lastTab', 'forceTabByUrl'], result => {
            const force = result.forceTabByUrl;
            const last = result.lastTab || 'page';
            chrome.storage.local.set({forceTabByUrl: false});

            if (force) {
                if (isPathTranslate && Object.keys(bookmark.path || {}).length > 0) {
                    activateTab('path');
                } else if (isPageTranslate && Object.keys(bookmark.page || {}).length > 0) {
                    activateTab('page');
                } else {
                    activateTab(last);
                }
            } else {
                activateTab(last);
            }
        });
    });
})();
