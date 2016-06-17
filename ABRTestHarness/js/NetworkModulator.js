NetworkModulator = function() {

    // NetworkModulator uses browsermob.
    // NetworkModulator assumes that the following commands (or equivalent) were executed:
    //     $ browsermob-proxy --port 8080
    //     $ curl -X POST -d 'port=8008' http://localhost:8080/proxy'

    var PROXY_CONTROL_URL = 'http://localhost:8080/proxy/8008/limit';
    var profile = null;
    var currentProfileIndex = NaN;
    var profileStepTimeout = null;

    function loadProfile(url, callback) {

        var xhr = new XMLHttpRequest();
        xhr.overrideMimeType("application/json");
        xhr.open('GET', url);
        xhr.onloadend = function() {
            // TODO: check for errors
            if (xhr.status >= 200 && xhr.status <= 299) {
                profile = JSON.parse(xhr.responseText).profile;
                callback();
            }
        };
        xhr.send();
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
        profile = null;
    }


    function stepProfile() {
        var p = profile[currentProfileIndex];
        setProxyThroughput(p.throughput_Mbps, p.latency_ms);
        profileStepTimeout = setTimeout(stepProfile,  p.duration_s * 1000);
        currentProfileIndex++;
        if (currentProfileIndex === profile.length) {
            // should not overrun profile, but if we do restart from beginning rather than fail
            currentProfileIndex = 0;
        }
    }

    function setProxyThroughput(mbps, latency) {
        var kBps = 0;
        if (!isNaN(mbps)) {
            // NaN should clear throttling - this is achieved by setting bw to 0
            if (mbps === 0) {
                // since 0 clears throttling, choose very low bw for network out
                kBps = 1;
            }
            else {
                kBps = Math.ceil(mbps / 0.008); // kilobytes per second
            }
        }

        var xhr = new XMLHttpRequest();

        var url = PROXY_CONTROL_URL;
        var params = "upstreamKbps=" + kBps + "&latency=" + latency;
        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
        //todo error check to make sure we are setting the proxy throughput
        xhr.send(params);
    }

    return {
        loadProfile: loadProfile,
        start: start,
        stop: stop
    }

}

NetworkModulator.prototype = {
    constructor: NetworkModulator
};
