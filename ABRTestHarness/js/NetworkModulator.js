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
        var kbps = NaN;
        mbps = Number(mbps);
        if (isNaN(mbps)) {
            // NaN should clear throttling - this is achieved by setting bw to 0
            kbps = 0;
            latency = 0;
        } else {
            if (mbps <= 0.001) {
                // since 0 clears throttling, choose very low bw for network out
                kbps = 1;
            }
            else {
                kbps = Math.ceil(mbps * 1000); // kilobytes per second
            }
        }

        var xhr = new XMLHttpRequest();
        var url = CONTROL_BASE_URL + '?bw=' + kbps + 'Kbps&delay=' + latency + 'ms';
        xhr.open("GET", url);
        //todo error check to make sure we are setting the proxy throughput
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
