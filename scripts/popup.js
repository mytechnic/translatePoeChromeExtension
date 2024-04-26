$(function () {
    let init = function () {
        chrome.storage.sync.get().then((data) => {
            console.log(data);
            let language = data['language'] || 'ko';
            let auto_check = data['auto'] || '1';
            setLanguage(language);
            setAuto(auto_check === '1');
        });
    }

    let setLanguage = function (language) {
        $('[name=language]').each(function (index) {
            if ($(this).data('lang') === language) {
                $('div[name=language_name]').text($(this).find('img').attr('alt'));
                $(this).addClass('active');
            } else {
                $(this).removeClass('active');
            }
        });
    }

    let changeLanguage = function (language) {
        setLanguage(language);
        chrome.storage.sync.set({'language': language}).then(() => {
            console.log('language is set ' + language);
        });
    }

    let setAuto = function (auto) {
        $('input[name=auto]').prop('checked', auto);
    }

    let changeAuto = function (auto_check) {
        let auto = auto_check ? '1' : '0';
        chrome.storage.sync.set({'auto': auto}).then(() => {
            console.log('auto is set ' + auto);
        });
    }

    init();

    $('[name=language]').on('click', function () {
        changeLanguage($(this).data('lang'));
    });

    $('[name=auto]').on('click', function () {
        changeAuto($(this).prop('checked'));
    });
});