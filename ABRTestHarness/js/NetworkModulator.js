NetworkModulator = function(callback) {

    // run control.py such that CONTROL_BASE_URL reaches it
    var CONTROL_BASE_URL = 'http://localhost:8081/settings';

    var profileStepCallback = callback;
    var profile = null;
    var currentProfileIndex = NaN;
    var profileStepTimeout = null;

    function setProfile(p) {
        profile = p.profile;
    }

    function start() {
        currentProfileIndex = 0;
        stepProfile(); // start proxy throttling
    }

    function stop() {
        if (profileStepTimeout) {
            clearTimeout(profileStepTimeout);
            profileStepTimeout = null;
        }
        setProxyThroughput(NaN, 0);
    }

    function stepProfile() {
        var p = profile[currentProfileIndex];
        setProxyThroughput(p.throughput_Mbps, p.latency_ms);
        profileStepCallback({type:"proxyChange", profile:p});
        profileStepTimeout = setTimeout(stepProfile,  p.duration_s * 1000);
        currentProfileIndex++;
        if (currentProfileIndex === profile.length) { //TODO fix this should not repeat
            // should not overrun profile, but if we do then restart from beginning rather than fail
            currentProfileIndex = 0;
        }
    }

    function setProxyThroughput(mbps, latency) {
        var url = CONTROL_BASE_URL;
        if (!isNaN(mbps)) {
            // NaN should clear throttling - in that case do not change base url
            var kbps = Math.ceil(Number(mbps) * 1000); // kilobytes per second
            if (kbps < 1) {
                // 0 means unlimited, so avoid
                kbps = 1;
            }
            url += '?bw=' + kbpw + 'Kbps';
            // do not set latency - it tends to slow down dummynet excessively
            // TODO: investigate this behavior
            // url += '&delay=' + latency + 'ms';
        }

        var xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        // TODO: error check to make sure we are setting the proxy throughput
        // 400/404 if url not correct
        // 500 if ipfw failed
        xhr.send();
    }

    return {
        setProfile: setProfile,
        start: start,
        stop: stop
    }

}

NetworkModulator.prototype = {
    constructor: NetworkModulator
};
