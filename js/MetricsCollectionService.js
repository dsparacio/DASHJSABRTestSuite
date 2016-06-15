MetricsCollectionService = function() {

    $.couch.urlPrefix =  'http://dev-mediac-osqa01.kendall.corp.akamai.com:5984';
    var DB_NAME = "dashabr_test_results";
    var document = null;

    function initialize() {
        document = new MetricSessionDocument();
    }

    function addToDocument(key, value) {
        document[key] = value;
    }

    function saveDocumentToDB() {
        $.couch.db(DB_NAME).saveDoc(document, {
            success: function(data) {
                console.log(data);
            },
            error: function(status) {
                console.log(status);
            }
        });
    }

    return {
        initialize: initialize,
        addToDocument: addToDocument,
        saveDocumentToDB: saveDocumentToDB
    }

}


MetricsCollectionService.prototype = {
    constructor: MetricsCollectionService
}