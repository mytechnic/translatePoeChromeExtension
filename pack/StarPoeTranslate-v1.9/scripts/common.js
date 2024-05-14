function getPageUrl(url) {
    let page = url.split('?')[0];

    if (page.endsWith('/')) {
        page = page.slice(0, -1);
    }

    return page;
}

function getPathUrl(url) {
    if (url.startsWith('https://poe.ninja/builds/necropolis/character/')) {
        return 'https://poe.ninja/builds/necropolis/character/';
    } else if (url.startsWith('https://poe.ninja/builds/streamers/character/')) {
        return 'https://poe.ninja/builds/streamers/character/';
    }

    if (url.endsWith('/')) {
        return url;
    }

    return url.split('/').slice(0, -1).join('/') + '/';
}

function versionPromise() {
    return new Promise((resolve, reject) => {
        $.ajax({
            dataType: 'json',
            url: 'https://mytechnic.github.io/translate/poe_kr_version.json',
            success: function (result) {
                resolve(result['version']);
            }
        });
    });
}

function dictionaryPromise() {
    return new Promise((resolve, reject) => {
        $.ajax({
            dataType: 'json',
            url: 'https://mytechnic.github.io/translate/poe_kr.json',
            success: function (result) {
                resolve(result);
            }
        });
    });
}
