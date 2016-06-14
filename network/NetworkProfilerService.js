NetworkProfilerService = function() {

    var document = new ProfilerDBDocument();
    $.couch.urlPrefix =  'http://dev-mediac-osqa01.kendall.corp.akamai.com:5984';


    function getDeviceInfo(callback) {
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

    return {
        getDeviceInfo: getDeviceInfo,
        addToDocument: addToDocument,
        saveDocumentToDB: saveDocumentToDB
    }

}


NetworkProfilerService.prototype = {
    constructor: NetworkProfilerService
}