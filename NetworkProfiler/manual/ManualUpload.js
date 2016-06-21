ManualUpload = function() {

    $.couch.urlPrefix =  'http://dev-mediac-osqa01.kendall.corp.akamai.com:5984';
    var DB_DEV = 'network_profiler_dev';
    var DB_PROD = 'network_profiler';
    var DB_NAME = DB_DEV;

    function init() {
        $("#upload_button").click(doUpload);
    }

    function doUpload() {
        var contents = document.getElementById('profile_text').value;
        var doc = JSON.parse(contents);
        if (doc.comments) {
            doc.comments = '[manual upload from email]\n' + doc.comments;
        } else {
            doc.comments = '[manual upload from email]';
        }
        $.couch.db(DB_NAME).saveDoc(doc, {
            success: function(data) {
                document.getElementById('profile_text').value = '';
            },
            error: function(status) {
                console.log(status);
            }
        });
    }

    return {
        init: init
    }

}

ManualUpload.prototype = {
    constructor: ManualUpload
}
