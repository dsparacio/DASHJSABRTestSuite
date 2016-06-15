NetworkProfilerService = function() {

    var document = null;

    function initialize() {
        $.couch.urlPrefix =  'http://dev-mediac-osqa01.kendall.corp.akamai.com:5984';

        var date = new Date();
        var info = $.pgwBrowser();

        document = new ProfilerDBDocument();
        document.guid = getGUID();
        document.date = date.toDateString(); // Have some options here for format need to pick one.
        document.timezone_offset = date.getTimezoneOffset();
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


    function getOS() {
        var ua = navigator.userAgent.toLowerCase();
        return {
            isWin7: /windows nt 6.1/.test(ua),
            isWin8: /windows nt 6.2/.test(ua),
            isWin81: /windows nt 6.3/.test(ua)
        };
    };



    function getLocationInfo(callback) {


        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'http://ipinfo.io/json', true);
        xhr.overrideMimeType('application/json');
        xhr.onloadend = function() {
            if (xhr.status >= 200 && xhr.status <= 299) {
                Object.assign(document, JSON.parse(xhr.response));
                callback();
            }
        }
        xhr.send();
    }

    function addToDocument(key, value) {
        if (document[key] !== undefined) {
            document[key] = value;
        }

    }

    function saveDocumentToDB() {

        $.couch.db("network_profiler").saveDoc(document, {
            success: function(data) {
                console.log(data);
            },
            error: function(status) {
                console.log(status);
            }
        });

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