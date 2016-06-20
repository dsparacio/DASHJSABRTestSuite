NetworkProfilerService = function() {

    $.couch.urlPrefix =  'http://dev-mediac-osqa01.kendall.corp.akamai.com:5984';
    var DB_DEV = 'network_profiler_dev';
    var DB_PROD = 'network_profiler';
    var DB_NAME = DB_DEV;
    var document = null;
    var dbWriteTimout = 5000;

    function initialize() {

        var date = new Date();
        var info = $.pgwBrowser();

        document = new ProfilerDBDocument();
        document.guid = getGUID();
        document.date = date.toDateString(); // Have some options here for format need to pick one.
        document.timezone_offset = date.getTimezoneOffset() / 60;
        document.userAgent = info.userAgent;
        document.browser_name = info.browser.name;
        document.browser_fullVersion = info.browser.fullVersion;
        document.browser_majorVersion = info.browser.majorVersion;
        document.browser_minorVersion = info.browser.minorVersion;
        document.os_name = info.os.name;
        document.os_vender = info.os.group;
        document.os_fullVersion = info.os.fullVersion;
        document.os_majorVersion = info.os.majorVersion;
        document.os_minorVersion = info.os.minorVersion;
        document.viewport_height = info.viewport.height;
        document.viewport_width = info.viewport.width;
        document.viewport_orientation = info.viewport.orientation;
    }

    function getLocationInfo(callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'http://ipinfo.io/json', true);
        xhr.overrideMimeType('application/json');
        xhr.onloadend = function() {
            if (xhr.status >= 200 && xhr.status <= 299) {
                Object.assign(document, JSON.parse(xhr.response));
                callback();
            }
            else {
                callback('Cannot process ip information.');
            }
        }
        xhr.send();
    }

    function addToDocument(key, value) {
        if (document[key] !== undefined) {
            document[key] = value;
        }
    }

    function saveDocumentToDB(callback) {
        var timeout = null;

        $.couch.db(DB_NAME).saveDoc(document, {
            success: function(data) {
                console.log(data);
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                if (callback) {
                    callback(true);
                    callback = null;
                }
            },
            error: function(status) {
                console.log(status);
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                if (callback) {
                    callback(false, document);
                    callback = null;
                }
            }
        });

        timeout = setTimeout(function () {
            console.log('db write timeout');
            timeout = null;
            if (callback) {
                callback(false, document);
                callback = null;
            }
        }, dbWriteTimout);
    }

    function getGUID() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    return {
        initialize: initialize,
        getLocationInfo: getLocationInfo,
        addToDocument: addToDocument,
        saveDocumentToDB: saveDocumentToDB
    }

}


NetworkProfilerService.prototype = {
    constructor: NetworkProfilerService
}
