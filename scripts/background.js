// scripts/background.js

(() => {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'TRANSLATE_NOW_FORCE') {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                const tab = tabs?.[0];
                const tabId = tab?.id;
                const url = tab?.url;

                if (
                    tabId &&
                    chrome.scripting &&
                    url &&
                    !url.startsWith('chrome://') &&
                    !url.startsWith('chrome-extension://')
                ) {
                    chrome.scripting.executeScript(
                        {
                            target: {tabId},
                            files: ['scripts/content.js']
                        },
                        () => {
                            console.log('[background.js] content.js reinjected');
                            sendResponse({status: 'executed'});
                        }
                    );
                } else {
                    console.warn('[background.js] Invalid tab or URL - skipping injection');
                    sendResponse({status: 'skipped'});
                }
            });

            return true; // Keep sendResponse alive
        }
    });
})();
