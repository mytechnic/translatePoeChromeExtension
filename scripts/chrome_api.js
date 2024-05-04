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