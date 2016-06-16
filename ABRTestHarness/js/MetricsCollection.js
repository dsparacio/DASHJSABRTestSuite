MetricsCollection = function() {

    var dict = {};

    function createSession(info) {
        dict[info.id] = {metrics:[], sessionInfo:info};
    }

    function push(id, set) {
        dict[id].metrics.push(set);
    }

    function getSessions(id, set) {
        return dict;
    }

    function getSessionById(id) {
        return dict[id];
    }

    return {
        push: push,
        createSession: createSession,
        getSessions: getSessions,
        getSessionById: getSessionById
    }
}

MetricsCollection.prototype = {
    constructor: MetricsCollection
};