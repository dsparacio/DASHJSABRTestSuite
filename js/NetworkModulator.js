

NetworkModulator = function() {

   var profile = null,
       currentProfileIndex = NaN,
       profileStepTimeout = null;

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
        setProxyThroughput(0, 0);
        profile = null;
    }


    function stepProfile() {
        var p = profile[currentProfileIndex];
        setProxyThroughput(p.throughput_Mbps, p.latency_ms);
        profileStepTimeout = setTimeout(stepProfile,  p.duration_s * 1000);
        currentProfileIndex++;
    }

    function setProxyThroughput(mbps, latency) {
        var kBps = Math.ceil(mbps / 0.008); // kilobytes per second
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