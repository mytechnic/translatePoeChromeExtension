// popup.js
(() => {
    // ===== 전역 상태 =====
    let currentPage = '';
    let currentPath = '';
    let isPageActive = false;
    let isPathActive = false;
    let bookmark = {};
    let lastTab = 'page';

    // ===== 유틸 =====
    const getPageUrl = url => url.split('?')[0].replace(/\/$/, '');
    const getPathUrl = url => url.endsWith('/') ? url : url.split('/').slice(0, -1).join('/') + '/';
    const setSyncStorage = data => chrome.storage.sync.set(data);
    const getSyncStorage = () => chrome.storage.sync.get();
    const getLocalStorage = () => chrome.storage.local.get();
    const setLocalStorage = data => chrome.storage.local.set(data);

    const sendTranslateNow = () => {
        chrome.tabs.query({active: true, currentWindow: true}, tabs => {
            const tab = tabs[0];
            chrome.tabs.sendMessage(tab.id, {type: 'TRANSLATE_NOW'});
        });
    };

    // ===== 상태 렌더링 =====
    const renderStatus = () => {
        const el = document.getElementById('auto-translate-status');
        el.textContent = (isPageActive || isPathActive)
            ? '🟢 이 페이지는 번역 중입니다'
            : '🔴 이 페이지는 아직 번역되지 않았어요';
        el.className = (isPageActive || isPathActive) ? 'status on' : 'status off';
    };

    const renderList = (containerId, data, type) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        if (!data || Object.keys(data).length === 0) {
            container.innerHTML = `<p>저장된 ${type === 'page' ? '페이지' : '경로'}가 없습니다.</p>`;
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
                delete bookmark[type][url];
                setSyncStorage(bookmark);
                sendTranslateNow();
                updateState();
            };

            li.appendChild(btn);
            ul.appendChild(li);
        });
        container.appendChild(ul);
    };

    const renderTabLists = () => {
        renderList('content-page', bookmark.page, 'page');
        renderList('content-path', bookmark.path, 'path');
    };

    const applyButtonState = () => {
        const buttons = {
            addPage: '.addPage',
            addPath: '.addPath',
            delPage: '.delPage',
            delPath: '.delPath'
        };

        Object.values(buttons).forEach(id => document.querySelector(id).style.display = 'none');

        if (isPageActive) document.querySelector(buttons.delPage).style.display = '';
        else if (isPathActive) document.querySelector(buttons.delPath).style.display = '';
        else {
            document.querySelector(buttons.addPage).style.display = '';
            document.querySelector(buttons.addPath).style.display = '';
        }
    };

    const activateTab = id => {
        lastTab = id;
        document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
        document.getElementById(`tab-${id}`).classList.add('active');
        document.getElementById(`content-${id}`).classList.remove('hidden');
        setLocalStorage({lastTab: id});
    };

    // ===== 번역 설정 =====
    const setPageTranslate = flag => {
        bookmark.page = bookmark.page || {};
        flag ? bookmark.page[currentPage] = true : delete bookmark.page[currentPage];
        setSyncStorage(bookmark);
        setLocalStorage({forceTabByUrl: true});
        sendTranslateNow();
        updateState();
        if (flag) activateTab('page');
    };

    const setPathTranslate = flag => {
        bookmark.path = bookmark.path || {};
        flag ? bookmark.path[currentPath] = true : delete bookmark.path[currentPath];
        setSyncStorage(bookmark);
        setLocalStorage({forceTabByUrl: true});
        sendTranslateNow();
        updateState();
        if (flag) activateTab('path');
    };

    const updateState = () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const url = tabs?.[0]?.url || '';
            currentPage = getPageUrl(url);
            currentPath = getPathUrl(url);

            isPageActive = !!bookmark.page?.[currentPage];
            isPathActive = Object.keys(bookmark.path || {}).some(p => url.startsWith(p));

            renderStatus();
            renderTabLists();
            applyButtonState();
        });
    };

    // ===== 이벤트 바인딩 =====
    const bindEvents = () => {
        document.querySelector('button[name=addPage]').onclick = () => setPageTranslate(true);
        document.querySelector('button[name=addPath]').onclick = () => setPathTranslate(true);
        document.querySelector('button[name=delPage]').onclick = () => setPageTranslate(false);
        document.querySelector('button[name=delPath]').onclick = () => setPathTranslate(false);

        document.getElementById('save-dictionary').onclick = () => {
            const raw = document.getElementById('dictionary-editor').value;
            chrome.storage.local.set({userDictionary: raw, tempUserDictionary: raw});
            alert('사용자 사전이 저장되었습니다.');
        };

        document.getElementById('reset-all').onclick = () => {
            const msg = '정말 초기화하시겠어요? 저장된 설정과 단어장이 삭제됩니다.';
            if (confirm(msg)) {
                chrome.storage.local.clear();
                bookmark = {page: {}, path: {}};
                setSyncStorage(bookmark);
                document.getElementById('dictionary-editor').value = '';
                sendTranslateNow();
                updateState();
            }
        };

        ['page', 'path', 'dictionary', 'settings'].forEach(name => {
            document.getElementById(`tab-${name}`).onclick = () => activateTab(name);
        });

        document.getElementById('dictionary-editor').addEventListener('input', (e) => {
            chrome.storage.local.set({tempUserDictionary: e.target.value});
        });
    };

    // ===== 초기화 =====
    document.addEventListener('DOMContentLoaded', async () => {
        bindEvents();
        const [tabs, local, sync] = await Promise.all([
            chrome.tabs.query({active: true, currentWindow: true}),
            getLocalStorage(),
            getSyncStorage()
        ]);

        const url = tabs?.[0]?.url || '';
        currentPage = getPageUrl(url);
        currentPath = getPathUrl(url);
        bookmark = sync || {page: {}, path: {}};
        lastTab = local.lastTab || 'page';

        document.getElementById('version').textContent = local.version ?? '-';
        document.getElementById('dictionary-editor').value = local.tempUserDictionary || local.userDictionary || '';

        updateState();
        activateTab(lastTab);
    });
})();
