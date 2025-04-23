// popup.js
(() => {
    // ===== 전역 상태 =====
    let currentPage = '';
    let currentPath = '';
    let isPageActive = false;
    let isPathActive = false;
    let bookmark = {};
    let cacheVersion = -1;
    let lastTab = 'page';

    // ===== 유틸 =====
    const getPageUrl = url => url.split('?')[0].replace(/\/$/, '');
    const getPathUrl = url => {
        if (url.startsWith('https://poe.ninja/builds/necropolis/character/')) return 'https://poe.ninja/builds/necropolis/character/';
        if (url.startsWith('https://poe.ninja/builds/streamers/character/')) return 'https://poe.ninja/builds/streamers/character/';
        return url.endsWith('/') ? url : url.split('/').slice(0, -1).join('/') + '/';
    };

    const setSyncStorage = data => chrome.storage.sync.set(data);
    const getSyncStorage = () => chrome.storage.sync.get();
    const getLocalStorage = () => chrome.storage.local.get();
    const setLocalStorage = data => chrome.storage.local.set(data);
    const onStorageChange = callback => chrome.storage.onChanged.addListener((chg, ns) => callback(chg, ns));

    const fetchRemoteVersion = () => fetch('https://mytechnic.github.io/translate/poe_kr_version.json')
        .then(res => res.json())
        .then(data => data.version);

    const fetchDictionary = () => fetch('https://mytechnic.github.io/translate/poe_kr.json')
        .then(res => res.json());

    const ensureDictionary = async () => {
        const local = await getLocalStorage();
        const localVersion = local.version ?? -1;

        try {
            const remoteVersion = await fetchRemoteVersion();
            if (remoteVersion > localVersion) {
                const dictionary = await fetchDictionary();
                await setLocalStorage({version: remoteVersion, dictionary});
                return {version: remoteVersion, dictionary};
            } else {
                return {version: localVersion, dictionary: local.dictionary ?? {h: {}, p: {}}};
            }
        } catch (e) {
            return {version: localVersion, dictionary: local.dictionary ?? {h: {}, p: {}}};
        }
    };

    const sendTranslateNow = () => {
        chrome.tabs.query({active: true, currentWindow: true}, tabs => {
            const tab = tabs[0];
            chrome.scripting.executeScript({
                target: {tabId: tab.id},
                files: ['scripts/content.js']
            }, () => {
                chrome.tabs.sendMessage(tab.id, {type: 'TRANSLATE_NOW'});
            });
        });
    };

    // ===== 상태 렌더링 =====
    const renderStatus = () => {
        const el = document.getElementById('auto-translate-status');
        if (isPageActive || isPathActive) {
            el.textContent = '🟢 이 페이지는 번역 중입니다';
            el.className = 'status on';
        } else {
            el.textContent = '🔴 이 페이지는 아직 번역되지 않았어요';
            el.className = 'status off';
        }
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
        const show = id => document.querySelector(id).style.display = '';
        const hide = id => document.querySelector(id).style.display = 'none';

        hide('.addPage');
        hide('.addPath');
        hide('.delPage');
        hide('.delPath');

        if (isPageActive) show('.delPage');
        else if (isPathActive) show('.delPath');
        else {
            show('.addPage');
            show('.addPath');
        }
    };

    const activateTab = id => {
        lastTab = id;
        document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
        document.getElementById(`tab-${id}`).classList.add('active');
        document.getElementById(`content-${id}`).classList.remove('hidden');
        chrome.storage.local.set({lastTab: id});
    };

    // ===== 번역 설정 =====
    const setPageTranslate = flag => {
        bookmark.page = bookmark.page || {};
        if (flag) bookmark.page[currentPage] = true;
        else delete bookmark.page[currentPage];
        setSyncStorage(bookmark);
        chrome.storage.local.set({forceTabByUrl: true});
        sendTranslateNow();
        updateState();
        if (flag) activateTab('page');
    };

    const setPathTranslate = flag => {
        bookmark.path = bookmark.path || {};
        if (flag) bookmark.path[currentPath] = true;
        else delete bookmark.path[currentPath];
        setSyncStorage(bookmark);
        chrome.storage.local.set({forceTabByUrl: true});
        sendTranslateNow();
        updateState();
        if (flag) activateTab('path');
    };

    const updateState = () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const url = tabs?.[0]?.url || '';
            const pageUrl = getPageUrl(url);
            const pathUrl = getPathUrl(url);

            currentPage = pageUrl;
            currentPath = pathUrl;

            isPageActive = !!bookmark.page?.[pageUrl];
            isPathActive = !!Object.keys(bookmark.path || {}).find(p => url.startsWith(p));

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
            chrome.storage.local.set({userDictionary: raw});
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
            const tab = document.getElementById(`tab-${name}`);
            const content = document.getElementById(`content-${name}`);
            tab.onclick = () => activateTab(name);
        });
    };

    // ===== 초기화 =====
    document.addEventListener('DOMContentLoaded', async () => {
        bindEvents();
        const [tabs, local, sync, dictionaryResult] = await Promise.all([
            chrome.tabs.query({active: true, currentWindow: true}),
            getLocalStorage(),
            getSyncStorage(),
            ensureDictionary()
        ]);

        const url = tabs?.[0]?.url || '';
        currentPage = getPageUrl(url);
        currentPath = getPathUrl(url);
        bookmark = sync || {page: {}, path: {}};
        cacheVersion = dictionaryResult.version;
        lastTab = local.lastTab || 'page';

        document.getElementById('version').textContent = cacheVersion;
        document.getElementById('dictionary-editor').value = local.userDictionary || '';

        updateState();
        activateTab(lastTab);
    });
})();