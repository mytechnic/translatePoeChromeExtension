// ✅ jquery-free common.js
(() => {
    function getPageUrl(url) {
        let page = url.split('?')[0];
        return page.endsWith('/') ? page.slice(0, -1) : page;
    }

    function getPathUrl(url) {
        if (url.startsWith('https://poe.ninja/builds/necropolis/character/')) {
            return 'https://poe.ninja/builds/necropolis/character/';
        } else if (url.startsWith('https://poe.ninja/builds/streamers/character/')) {
            return 'https://poe.ninja/builds/streamers/character/';
        }
        return url.endsWith('/') ? url : url.split('/').slice(0, -1).join('/') + '/';
    }

    function versionPromise() {
        return fetch('https://mytechnic.github.io/translate/poe_kr_version.json')
            .then(res => res.json())
            .then(data => data.version);
    }

    function dictionaryPromise() {
        return fetch('https://mytechnic.github.io/translate/poe_kr.json')
            .then(res => res.json());
    }

    function localStoragePromise() {
        return chrome.storage.local.get();
    }

    function syncStoragePromise() {
        return chrome.storage.sync.get();
    }

    function tabsPromise() {
        return chrome.tabs.query({active: true, currentWindow: true});
    }

    function setLocalStorage(data) {
        chrome.storage.local.set(data);
    }

    function setSyncStorage(data) {
        chrome.storage.sync.set(data);
    }

    function onChangeStorage(func) {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            func(changes, namespace);
        });
    }

    function clearSyncStorage() {
        chrome.storage.sync.clear();
        chrome.storage.local.clear();
    }

    function chromeOnMessage(handler) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            handler(message, sender, sendResponse);
        });
    }

    // export to window (전역 등록)
    window.getPageUrl = getPageUrl;
    window.getPathUrl = getPathUrl;
    window.versionPromise = versionPromise;
    window.dictionaryPromise = dictionaryPromise;
    window.localStoragePromise = localStoragePromise;
    window.syncStoragePromise = syncStoragePromise;
    window.tabsPromise = tabsPromise;
    window.setLocalStorage = setLocalStorage;
    window.setSyncStorage = setSyncStorage;
    window.onChangeStorage = onChangeStorage;
    window.clearSyncStorage = clearSyncStorage;
    window.chromeOnMessage = chromeOnMessage;
})();
