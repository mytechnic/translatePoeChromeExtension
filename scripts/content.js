db = {};
keys = {};

function entries(from, to) {
    let db = {};
    for (let i in from) {
        for (let key in from[i]) {
            if (key === 'disc' || key === 'flags') {
                continue;
            }
            db[from[i][key]] = to[i][key];
            keys[key] = key;
        }
    }
    return db;
}

function label(from, to) {
    let db = {};
    db[from['label']] = to['label'];
    return db;
}

function extractText(node) {
    if (node.nodeType === 3) {
        if (node.nodeValue && db[node.nodeValue]) {
            node.nodeValue = db[node.nodeValue];
        }
    }
    node.childNodes.forEach(child => {
        extractText(child);
    });
}

function loadTranslate() {
    for (let i in data['us'].items.result) {
        let from = data['us'].items.result[i];
        let to = data['kr'].items.result[i];
        Object.assign(db, label(from, to));
        Object.assign(db, entries(from.entries, to.entries));
    }
}

function translater() {
    loadTranslate();
    extractText(document.body);
}

$(function () {
    translater();
});