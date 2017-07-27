NetworkProfileService = function() {

    $.couch.urlPrefix =  '<URL TO YOUR COUCH DB>';
    var DB_DEV = 'network_profiler_dev';
    var DB_PROD = 'network_profiler';
    var DB_NAME = DB_PROD;
    var profileIDList = null;
    var profileList = null;
    var currentProfileIDListIndex = 0;
    var currentProfileIndex = 0;

    function initialize(url, callback) {

        profileList = [];

        var xhr = new XMLHttpRequest();
        xhr.overrideMimeType("application/json");
        xhr.open('GET', url);
        xhr.onloadend = function() {
            if (xhr.status >= 200 && xhr.status <= 299) {
                profileIDList = JSON.parse(xhr.responseText).profiles;
                currentProfileIDListIndex = 0;
                currentProfileIndex = 0;
                loadProfiles(callback);
            }
        };
        xhr.send();
    }


    function loadProfiles(callback) {

        function increment() {
            ++currentProfileIDListIndex;
            if (currentProfileIDListIndex < profileIDList.length) {
                loadProfiles(callback);
            } else {
                callback();
            }
        }

        $.couch.db(DB_NAME).openDoc(profileIDList[currentProfileIDListIndex].id, {
            success: function(data) {
                profileList.push(JSON.parse(data.profile));
                increment();
            },
            error: function(status) {
                increment();
            }
        });
    }

    function getNextProfile() {
        var r = null;
        if (currentProfileIndex < profileList.length) {
            r = profileList[currentProfileIndex];
            ++currentProfileIndex;
        }
        return r;
    }


    return {
        initialize: initialize,
        getNextProfile: getNextProfile
    }

}


NetworkProfileService.prototype = {
    constructor: NetworkProfileService
}
