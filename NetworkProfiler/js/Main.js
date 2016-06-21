Main = function () {

    var samplePeriodS = 5;
    var textboxMaxLines = 10;
    var urlPrefix = 'http://dash.edgesuite.net/akamai/bbb_30fps/';
    var urlSuffix = '_2.m4v';
    // url = urlPrefix + RepresentationID + '/' + RepresentationID + urlSuffix
    var representationIndex = NaN; // initialized later
    var representation = [
        { RepresentationID: 'bbb_30fps_320x180_200k',     size: 119747  },
        { RepresentationID: 'bbb_30fps_320x180_400k',     size: 234489  },
        { RepresentationID: 'bbb_30fps_480x270_600k',     size: 346282  },
        { RepresentationID: 'bbb_30fps_640x360_800k',     size: 461860  },
        { RepresentationID: 'bbb_30fps_640x360_1000k',    size: 578175  },
        { RepresentationID: 'bbb_30fps_768x432_1500k',    size: 869475  },
        { RepresentationID: 'bbb_30fps_1024x576_2500k',   size: 1468268 },
        { RepresentationID: 'bbb_30fps_1280x720_4000k',   size: 2426613 },
        { RepresentationID: 'bbb_30fps_1920x1080_8000k',  size: 4854465 },
        { RepresentationID: 'bbb_30fps_3840x2160_12000k', size: 7207392 },
    ];

    var cacheBreakCounter = Date.now();
    var running = false;
    var networkTypeSelected = false;
    var stillGettingIPInfo = true;
    var initDownload = null;
    var initDownloadRepresentationIndex = 5;
    var initRepresentation = NaN;
    var download = null;
    var timeLeftS = NaN;
    var tickerTimeout = null;
    var tickerMin = NaN;
    var tickerNext = NaN;
    var service = new NetworkProfilerService();

    var profileJson;
    var delimiterProfileJson;
    var indexProfileJson;
    var averageThroughput;
    var lines;
    var textbox;


    function handlePageUnload(e) {
        return 'Do you want to leave this site?'
    }


    function init() {

        $("input[name='connection_type']").change(updateNetworkType);
        $("input[name='duration']").change(updateEstimateData);
        $("#button_start").click(clickStart);

        profileJson = '{\n    "profile": [';
        delimiterProfileJson = '\n        ';
        indexProfileJson = 0;
        averageThroughput = 0;

        lines = [];
        textbox = document.getElementById('textbox');

        service.initialize();
        service.getLocationInfo(function(e) {
            if (e) {
                document.getElementById('status').innerHTML = 'ERROR: ' + e;
                return;
            }

            stillGettingIPInfo = false;
            var nt = getNetworkType();
            if (nt === null) {
                document.getElementById('status').innerHTML = 'Please choose connection type &hellip;';
                return;
            }

            chooseRepresentation(nt);
        })

    }

    function chooseRepresentation(networkType) {
        if (networkType === '3G' || networkType === '4G') {
            if (initDownload) {
                // abort any ongoing bandwidth estimation
                cancelDownload(initDownload);
                initDownload = null;
            }

            representationIndex = 0;
            document.getElementById('status').innerHTML = '';
            document.getElementById('button_start').disabled = false;
            updateEstimateData();
            return;
        }

        if (!isNaN(initRepresentation)) {
            // already have estimate for bandwidth
            representationIndex = initRepresentation;
            document.getElementById('status').innerHTML = '';
            document.getElementById('button_start').disabled = false;
            updateEstimateData();
            return;
        }

        // if we arrive here, we need to estimate the bandwidth

        document.getElementById('status').innerHTML = 'Estimating bandwidth &hellip;';
        document.getElementById('button_start').disabled = true;

        if (initDownload) {
            // already estimating bandwidth
            return;
        }

        initDownload = startDownload(initDownloadRepresentationIndex, 1000 * samplePeriodS, function (bytesDownloaded, latency, throughput) {
            if (bytesDownloaded === 0) {
                // TODO: report error
                // Do not set initRepresentation - maybe it works later?
                representationIndex = 0;
            } else {
                var size = 0.9 * (1000 * samplePeriodS - latency) * throughput / 0.008;
                representationIndex = 0;
                while (representationIndex + 1 < representation.length && representation[representationIndex + 1].size <= size) {
                    ++representationIndex;
                }
                initRepresentation = representationIndex;
            }
            document.getElementById('status').innerHTML = '';
            document.getElementById('button_start').disabled = false;
            updateEstimateData();
        }, true);
    }

    function generateUrl(representationIndex, disableCacheBreak) {
        var RepresentationID = representation[representationIndex].RepresentationID;
        var url = urlPrefix + RepresentationID + '/' + RepresentationID + urlSuffix;
        if (!disableCacheBreak) {
            url += '?nocache=' + cacheBreakCounter;
            ++cacheBreakCounter;
        }
        return url;
    }

    function startDownload(representationIndex, duration, callback, fastExit) { // callback(bytesDownloaded, latency, throughput)
        var timeReqSentMs      = Date.now();
        var timeFirstByteMs    = null;
        var timeLastProgressMs = null;
        var timeReadyMs        = null;
        var bytesLoaded = 0;
        var timeout = null;

        var xhr = new XMLHttpRequest();
        xhr.open('GET', generateUrl(representationIndex), true);
        xhr.overrideMimeType('text/plain; charset=x-user-defined');

        xhr.onprogress = function (e) {
            if (e.loaded > 0) {
                bytesLoaded = e.loaded;
                timeLastProgressMs = Date.now();
                if (!timeFirstByteMs) {
                    timeFirstByteMs = timeLastProgressMs - 1; // avoid remote possibility of division by zero
                }
            }
        };

        xhr.onload = function (e) {
            bytesLoaded = e.loaded;
            timeReadyMs = Date.now();
            if (fastExit) {
                clearTimeout(timeout);
                callback(bytesLoaded, timeFirstByteMs - timeReqSentMs, 0.008 * bytesLoaded / (timeReadyMs - timeFirstByteMs));
                return {xhr: null, timeout: null};
            }
        };

        timeout = setTimeout(function () {
            if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
                callback(bytesLoaded, timeFirstByteMs - timeReqSentMs, 0.008 * bytesLoaded / (timeReadyMs - timeFirstByteMs));
            } else if (xhr.readyState === 3 && bytesLoaded > 0) {
                xhr.abort();
                callback(bytesLoaded, timeFirstByteMs - timeReqSentMs, 0.008 * bytesLoaded / (timeLastProgressMs - timeFirstByteMs));
            } else {
                xhr.abort();
                callback(0, 0, 0);
            }
        }, duration);

        xhr.send();

        return {xhr: xhr, timeout: timeout};
    }

    function cancelDownload(download) {
        if (download) {
            if (download.xhr) {
                download.xhr.abort();
            }
            if (download.timeout) {
                clearTimeout(download.timeout);
            }
        }
    }

    function formatTime(timeS) {
        var str = '';
        if (timeS <= 0) {
            return str;
        }
        if (timeS > 60) {
            str = Math.floor(timeS / 60) + ':';
            timeS %= 60;
        } else {
            str = '0:';
        }
        if (timeS < 10) {
            str += '0';
        }
        str += timeS;
        return str;
    }

    function nextDownload() {
        download = startDownload(representationIndex, 1000 * samplePeriodS, function (bytesDownloaded, latency, throughput) {
            lines.push('[' + indexProfileJson + '] latency: ' + latency + ' ms, throughput: ' + throughput.toFixed(3) + ' Mbps');
            if (lines.length > textboxMaxLines) {
                lines.splice(0, lines.length - textboxMaxLines);
            }
            textbox.innerHTML = lines.join('<br/>');

            profileJson += delimiterProfileJson + '{"index": "' + indexProfileJson + '", "duration_s": "' + samplePeriodS.toFixed(0) + '", "latency_ms": "' + latency.toFixed(0) + '", "throughput_Mbps": "' + throughput.toFixed(3) + '"}';
            delimiterProfileJson = ',\n        ';
            ++indexProfileJson;
            averageThroughput += (throughput - averageThroughput) / indexProfileJson;

            timeLeftS -= samplePeriodS;

            if (tickerTimeout) {
                clearTimeout(tickerTimeout);
                tickerTimeout = null;
            }

            if (timeLeftS <= 0) {
                testReady();
                return; // stop download cycle here
            }

            tickerMin = timeLeftS - samplePeriodS;
            if (tickerMin < 0) {
                tickerMin = 0;
            }
            tickerNext = timeLeftS;
            tickerUpdate();

            nextDownload();
        });
    }

    function tickerUpdate() {
        document.getElementById('status').innerHTML = 'Running test &hellip; &emsp; ' + formatTime(tickerNext);
        --tickerNext;
        if (tickerNext < tickerMin) {
            return;
        }

        tickerTimeout = setTimeout(function () {
            tickerTimeout = null;
            tickerUpdate();
        }, 1000);
    }

    function clickStart() {
        if (!running) {
            // Start
            running = true;

            service.addToDocument("start_epoch", Date.now());

            window.onbeforeunload = handlePageUnload;
            document.getElementById('button_start').innerHTML = 'Finish Now';

            document.getElementById('connection_type_3G').disabled = true;
            document.getElementById('connection_type_4G').disabled = true;
            document.getElementById('connection_type_WiFi').disabled = true;
            document.getElementById('connection_type_wired').disabled = true;
            document.getElementById('connection_type_other').disabled = true;
            document.getElementById('connection_vpn').disabled = true;

            document.getElementById('duration5').disabled = true;
            document.getElementById('duration15').disabled = true;
            document.getElementById('duration30').disabled = true;
            document.getElementById('duration60').disabled = true;

            timeLeftS = getTotalTime();

            tickerMin = timeLeftS - samplePeriodS;
            if (tickerMin < 0) {
                tickerMin = 0;
            }
            tickerNext = timeLeftS;
            tickerUpdate();

            nextDownload();
        } else {
            // Stop
            cancelDownload(download);
            testReady();
        }
    }

    function getTotalTime() {
        var t = NaN;
        if (document.getElementById('duration5').checked) {
            t = 300;
        }
        else if (document.getElementById('duration15').checked) {
            t = 900;
        }
        else if (document.getElementById('duration30').checked) {
            t = 1800;
        }
        else if (document.getElementById('duration60').checked) {
            t = 3600;
        }
        return t;
    }

    function getNetworkType() {
        var type = null;
        if (document.getElementById('connection_type_3G').checked) {
            type = '3G';
        }
        else if (document.getElementById('connection_type_4G').checked) {
            type = '4G';
        }
        else if (document.getElementById('connection_type_WiFi').checked) {
            type = 'WiFi';
        }
        else if (document.getElementById('connection_type_wired').checked) {
            type = 'wired';
        }
        else if (document.getElementById('connection_type_other').checked) {
            type = 'other';
        }
        return type;
    }

    function updateNetworkType() {
        if (stillGettingIPInfo) {
            return;
        }

        var nt = getNetworkType();
        if (nt === null) {
            return;
        }
        networkTypeSelected = true;
        chooseRepresentation(nt);
    }

    function updateEstimateData() {
        if (networkTypeSelected) {
            var s = representation[representationIndex].size * getTotalTime() / samplePeriodS;
            document.getElementById('estimate').innerHTML = 'Data estimate: ' + Math.ceil(0.000001 * s) + ' MB';
        }
    }

    function testReady() {
        if (tickerTimeout) {
            clearTimeout(tickerTimeout);
            tickerTimeout = null;
        }

        profileJson += '\n    ]\n}\n';

        document.getElementById('text_name').disabled = true;
        document.getElementById('text_email').disabled = true;
        document.getElementById('text_comments').disabled = true;
        document.getElementById('button_start').disabled = true;
        document.getElementById('status').innerHTML = 'Uploading network trace &hellip;';

        uploadProfile(profileJson);

        running = false;
    }

    function uploadProfile(profile) {
        var callback = function (success, doc) {
            window.onbeforeunload = null;

            if (success) {
                document.getElementById('status').innerHTML = 'Test complete. Thank you.';
            }
            else {
                var emailUrl = 'mailto:kspiteri@akamai.com?Subject=%5BNetworkProfile%5D%20Network%20Measurement&body=' + encodeURIComponent(JSON.stringify(doc));
                document.getElementById('status').innerHTML = 'Oops we cannot write to database since you are not on the ' +
                    'Akamai VPN. No problem, we have auto-populated an email for you to send us! If for some reason you do not see the email click the link to regenerate it. <a id="email_link" href="' + emailUrl + '">Regenerate the email</a>';
                document.getElementById('email_link').click();
            }
        };

        service.addToDocument("username", document.getElementById('text_name').value);
        service.addToDocument("email", document.getElementById('text_email').value);
        service.addToDocument("comments", document.getElementById('text_comments').value);
        service.addToDocument("end_epoch", Date.now());
        service.addToDocument("network_type", getNetworkType());
        service.addToDocument("network_vpn", document.getElementById('connection_vpn').checked);
        service.addToDocument("url", generateUrl(representationIndex, true));
        service.addToDocument("chunk_size", representation[representationIndex].size);
        service.addToDocument("chunks_downloaded", indexProfileJson);
        service.addToDocument("average_throughput", averageThroughput.toFixed(3));
        service.addToDocument("profile", profile);
        service.saveDocumentToDB(callback);
    }

    return {
        init: init
    }

}

Main.prototype = {
    constructor:Main
}
