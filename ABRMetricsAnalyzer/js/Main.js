Main = function () {

    $.couch.urlPrefix =  'http://dev-mediac-osqa01.kendall.corp.akamai.com:5984';
    var DB_DEV = 'dashabr_test_results_dev';
    var DB_PROD = 'dashabr_test_results';

    var dbName = null;

    var groups = {};

    var ctx1;

    function init() {
        ctx1 = $("#chart1");
        $("#button_load").click(changeGroup);
        $("#db_select").change(changeDatabase);
        $("#group_select").change(changeGroup);

        changeDatabase();
    }

    function changeDatabase() {
        $("#db_select").prop('disabled', true);
        groups = [];
        $("#group_select").empty();
        $("#id_select").empty();

        switch ($("#db_select").val()) {
        case 'Production':
            dbName = DB_PROD;
            break;

        case 'Development':
            dbName = DB_DEV;
            break;

        default:
            dbName = null;
            return;
        }

        $.couch.db(dbName).view("analyzer/all-doc-info", {
            success: function(data) {
                data.rows.forEach(function (element) {
                    var e = element.value;
                    var g = null;
                    var groupIndex = groups[e.groupId];
                    if (isNaN(groupIndex)) {
                        groupIndex = groups.length;
                        groups[e.groupId] = groupIndex;
                        g = [];
                        g.groupId = e.groupId;
                        groups.push(g);
                    } else {
                        g = groups[groupIndex];
                    }
                    g.push(e);
                });

                groups.forEach(function (g) {
                    g.sort((a, b) => (a.wallclock - b.wallclock));
                    g.firstWallclock = g[0].wallclock;
                });

                groups.sort((a, b) => (b.firstWallclock - a.firstWallclock)); // reverse

                groups.forEach(function (e, i) {
                    groups[e.groupId] = i;
                    var info = new Date(e.firstWallclock) + ' ' + e[0].mpd.substr(e[0].mpd.lastIndexOf('/') + 1) + ' (' + e.length + ')';
                    $("#group_select").append('<option value="' + e.groupId + '">' + info + '</option>');
                });

                $("#db_select").prop('disabled', false);

                changeGroup();
            },
            error: function(status) {
                console.log(status);
            }
        });
    }

    function changeGroup() {
        var groupIndex = groups[$("#group_select").val()];
        if (isNaN(groupIndex)) {
            return;
        }
        var g = groups[groupIndex];
        if (!g) {
            return;
        }

        loadDocuments(g);
    }

    var remainingDocuments = NaN;
    var documentsInfo = null;

    function loadDocuments(g) {
        remainingDocuments = g.length;
        documentsInfo = [];

        g.forEach(function (e) {
            $.couch.db(dbName).openDoc(e._id, {
                success: function(data) {
                    documentsInfo.push(analyzeDocument(data));
                    documentDone();
                },
                error: function(status) {
                    console.log('error:', status, e._id);
                    documentDone();
                }
            });
        });


    }

    var throughputChart = null;

    function documentDone() {
        --remainingDocuments;
        if (remainingDocuments > 0 || documentsInfo.length === 0) {
            return;
        }

        documentsInfo.sort((a, b) => (a.wallclockTime - b.wallclockTime));

        $("#group_info").html('fastSwitch: ' + documentsInfo[0].fastSwitch);

        var bitrates = documentsInfo[0].bitrates;

        var table = '<table>';

        table += '<tr><td>ABR</td>';
        documentsInfo.forEach(e => {table += '<td>' + e.abr + '</td>';});
        table += '</tr>';

        table += '<tr><td>rebuffers (low/other quality)</td>';
        documentsInfo.forEach(e => {table += '<td>' + e.rebufferCount + ' (' + e.rebufferCountAtLowestQuality + '/' + e.rebufferCountAtHigherQuality + ')' + '</td>';});
        table += '</tr>';

        table += '<tr><td>average rebuffer seconds</td>';
        documentsInfo.forEach(e => {table += '<td>' + e.rebufferAverage.toFixed(3) + '</td>';});
        table += '</tr>';

        table += '<tr><td>up switches (in Mbps)</td>';
        documentsInfo.forEach(e => {table += '<td>' + e.countSwitchUp + ' (' + (0.000001 * e.totalSwitchUp).toFixed(3) + ')' + '</td>';});
        table += '</tr>';

        table += '<tr><td>down switches (in Mbps)</td>';
        documentsInfo.forEach(e => {table += '<td>' + e.countSwitchDown + ' (' + (0.000001 * e.totalSwitchDown).toFixed(3) + ')' + '</td>';});
        table += '</tr>';

        table += '<tr><td>oscillations within ' + documentsInfo[0].oscillationThreshold + 's</td>';
        documentsInfo.forEach(e => {table += '<td>' + e.oscillationCount + '</td>';});
        table += '</tr>';

        table += '<tr><td>average bitrate in Mbps</td>';
        documentsInfo.forEach(e => {table += '<td>' + (0.000001 * e.qualityDownloadHistogram.map(function (x, i) {return x * bitrates[i];}).reduce((a, b) => (a + b)) / e.qualityDownloadHistogram.reduce((a, b) => (a + b))).toFixed(3) + '</td>';});
        table += '</tr>';

        bitrates.forEach((bitrate, index) => {
            table += '<tr><td>count q=' + index + ' (' + (0.000001 * bitrates[index]).toFixed(3) + 'Mbps)</td>';
            documentsInfo.forEach(e => {table += '<td>' + e.qualityDownloadHistogram[index] + '</td>';});
            table += '</tr>';
        });

        table += '</table>';

        $("#stats").html(table);

        documentsInfo.forEach(info => {
            console.log('ABR: ', info.abr);
            info.outputLog.forEach(out => console.log.apply(console, out));
        });

        if (throughputChart) {
            throughputChart.destroy();
        }

        var maxY = 0;
        if (documentsInfo[0].bitrates) {
            maxY = 0.000001 * documentsInfo[0].bitrates[documentsInfo[0].bitrates.length - 1];
        }
        if (documentsInfo[0].maxSetThroughput > maxY) {
            maxY = documentsInfo[0].maxSetThroughput;
        }
        ++maxY;

        var maxX = 0;
        documentsInfo.forEach(info => {
            if (info.maxTime > maxX) {
                maxX = info.maxTime;
            }
        });

        var colors = ['rgba(0,0,0,0.9)',
                      'rgba(192,0,0,0.9)',
                      'rgba(0,192,0,0.9)',
                      'rgba(0,0,192,0.9)',
                      'rgba(0,128,128,0.9)',
                      'rgba(128,0,128,0.9)',
                      'rgba(128,128,0,0.9)'
                     ];
        var colorIndex = 0;

        var datasets = [{
            label: 'set throughput',
            fill: false,
            lineTension: 0,
            data: documentsInfo[0].setThroughput,
            borderColor: colors[colorIndex]
        }];
        documentsInfo.forEach((info, index) => {
            colorIndex = (colorIndex + 1) % colors.length;
            datasets.push({
                label: info.abr + ': throughput',
                fill: false,
                lineTension: 0,
                data: info.measuredThroughput,
                borderColor: colors[colorIndex]
            });
            colorIndex = (colorIndex + 1) % colors.length;
            datasets.push({
                label: info.abr + ': requested',
                fill: false,
                lineTension: 0,
                data: info.chosenBitrate,
                borderColor: colors[colorIndex]
            });
            colorIndex = (colorIndex + 1) % colors.length;
            datasets.push({
                label: info.abr + ': rendered',
                fill: false,
                lineTension: 0,
                data: info.renderedBitrate,
                borderColor: colors[colorIndex]
            });
        });

        var options = {
            scales: {
                xAxes: [{
                    type: 'linear',
                    position: 'bottom',
                    ticks: {
                        min: 0,
                        max: maxX
                    }
                }],
                yAxes: [{
                    type: 'linear',
                    ticks: {
                        min: 0,
                        max: maxY
                    }
                }]
            }
        };
        // options.pan = {
        //     enabled: true,
        //     mode: 'xy'
        // };
        // options.zoom = {
        //     enabled: true,
        //     mode: 'xy'
        // };

        throughputChart = new Chart(ctx1, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: options
        });
    }

    function parseTime(t) {
        return new Date(t).getTime();
    }

    function analyzeDocument(doc) {
        var documentInfo = {};

        documentInfo.abr = doc.abr;
        documentInfo.fastSwitch = doc.fastSwitch;

        var startTime = parseTime(doc.wallclockTime);
        documentInfo.wallclockTime = doc.wallclockTime;

        // statistics
        var rebufferCount = 0;
        var rebufferCountAtLowestQuality = 0;
        var rebufferCountAtHigherQuality = 0;
        var rebufferAverage = 0;
        var countSwitchUp = 0;
        var totalSwitchUp = 0;
        var countSwitchDown = 0;
        var totalSwitchDown = 0;
        var oscillationThreshold = 10;
        var oscillationCount = 0;
        var qualityDownloadHistogram = null;
        var maxSetThroughput = 0;
        var maxTime = 0;
        var bitrates = null;
        var duration = NaN;

        // chart data - {x:, y:}
        var setThroughput = [];
        var measuredThroughput = [];
        var chosenBitrate = [];
        var renderedBitrate = [];

        var rebufferLastStalledTime = NaN;
        var rebufferLastLoadedTime = NaN;
        var lastQuality = NaN;
        var lastSwitchWasUp = false;
        var lastSwitchTime = NaN;
        var fragmentBuffer = [];

        // find bitrate list and duration from a fragmentLoadingCompleted event
        doc.metrics.some((e, i) => {
            if (e.eventType === 'fragmentLoadingCompleted' &&
                e.fragmentRequest &&
                e.fragmentRequest.mediaType === 'video' &&
                e.fragmentRequest.mediaInfo &&
                e.fragmentRequest.mediaInfo.bitrateList &&
                e.fragmentRequest.duration) {

                bitrates = e.fragmentRequest.mediaInfo.bitrateList.map(b => b.bandwidth);
                duration = e.fragmentRequest.duration;
                return true;
            }
        });
        qualityDownloadHistogram = bitrates.map(b => 0);

        documentInfo.outputLog = generateOutputLog(doc, bitrates);

        // go through metrics and update statistics and charts

        doc.metrics.forEach(function (element, index) {
            var time = 0.001 * (element.wallclockTime - startTime);

            switch (element.eventType) {

            case 'bufferStalled':
                ++rebufferCount;
                if (element.lastQualityLoaded === 0) {
                    ++rebufferCountAtLowestQuality;
                } else {
                    ++rebufferCountAtHigherQuality;
                }

                var t = rebufferLastLoadedTime;
                renderedBitrate.push({x: t, y: NaN});
                while (fragmentBuffer.length > 0 && fragmentBuffer[0].startTime < element.playheadTime + 0.5 * duration) {
                    var br = bitrates ? 0.000001 * bitrates[fragmentBuffer.shift().quality] : NaN;
                    renderedBitrate.push({x: t, y: br});
                    t += duration;
                    renderedBitrate.push({x: t, y: br});
                }
                renderedBitrate.push({x: time, y: NaN});

                rebufferLastStalledTime = time;
                break;

            case 'bufferLoaded':
                if (rebufferCount > 0) {
                    rebufferAverage += (time - rebufferLastStalledTime - rebufferAverage) / rebufferCount;
                }
                rebufferLastLoadedTime = time;
                break;

            case 'proxyChange':
                if (Number(element.profileStepInfo.throughput_Mbps) > maxSetThroughput) {
                    maxSetThroughput = Number(element.profileStepInfo.throughput_Mbps);
                }
                if (setThroughput.length > 0) {
                    setThroughput.push({x: time, y: setThroughput[setThroughput.length - 1].y});
                }
                setThroughput.push({x: time, y: element.profileStepInfo.throughput_Mbps});
                break;

            case 'qualityChangeRequested':
            case 'qualityChangeStart': // old event name
                chosenBitrate.push({x: time, y: 0.000001 * bitrates[element.lastQualityLoaded]});
                chosenBitrate.push({x: time, y: 0.000001 * bitrates[element.nextQualityLoading]});
                break;

            case 'fragmentLoadingCompleted':
            case 'fragmentLoadingAbandoned':
                if (element.fragmentRequest &&
                    element.fragmentRequest.mediaType === 'video' &&
                    element.fragmentRequest.type === 'MediaSegment') {

                    // TODO: handle fastSwitch

                    if (element.eventType === 'fragmentLoadingCompleted') {
                        ++qualityDownloadHistogram[element.fragmentRequest.quality];

                        // push info in fragment buffer, info will be used later to display rendered bitrates
                        fragmentBuffer.push({index: element.fragmentRequest.index, startTime: element.fragmentRequest.startTime, quality: element.fragmentRequest.quality});

                        if (!isNaN(lastQuality) && lastQuality !== element.fragmentRequest.quality) {
                            var switchIsUp = element.fragmentRequest.quality > lastQuality;
                            if (!isNaN(lastSwitchTime) && element.fragmentRequest.startTime <= lastSwitchTime + oscillationThreshold && switchIsUp !== lastSwitchWasUp) {
                                ++oscillationCount;
                            }

                            if (switchIsUp) {
                                ++countSwitchUp;
                                totalSwitchUp += bitrates[element.fragmentRequest.quality] - bitrates[lastQuality];
                            } else {
                                ++countSwitchDown;
                                totalSwitchDown -= bitrates[element.fragmentRequest.quality] - bitrates[lastQuality];
                            }

                            lastSwitchTime = element.fragmentRequest.startTime;
                            lastSwitchWasUp = switchIsUp;
                        }
                        lastQuality = element.fragmentRequest.quality;
                    }

                    // measured throughput
                    var bits = 8 * element.fragmentRequest.bytesLoaded;
                    // var bits = 8 * (element.fragmentRequest.bytesLoaded - element.fragmentRequest.trace[0].b[0]);
                    var downloadTime = NaN;
                    if (element.fragmentRequest.requestEndDate) {
                        downloadTime = 0.001 * (parseTime(element.fragmentRequest.requestEndDate) - parseTime(element.fragmentRequest.firstByteDate));
                    } else if (element.fragmentRequest.partialTrace) {
                        downloadTime = 0.001 * element.fragmentRequest.partialTrace.slice(1).map(t => t.d).reduce((a, b) => a + b);
                    }
                    var tp = 0.000001 * bits / downloadTime;
                    if (isNaN(tp) || tp < 0 || t1b < 0 || tre < 0) debugger;
                    var t1b = 0.001 * (parseTime(element.fragmentRequest.firstByteDate) - startTime);
                    var tre = t1b + downloadTime;
                    measuredThroughput.push({x: t1b, y: tp});
                    measuredThroughput.push({x: tre, y: tp});
                }
                break;
            }
        });

        var t = rebufferLastLoadedTime;
        renderedBitrate.push({x: t, y: NaN});
        while (fragmentBuffer.length > 0) {
            var br = bitrates ? 0.000001 * bitrates[fragmentBuffer.shift().quality] : NaN;
            renderedBitrate.push({x: t, y: br});
            t += duration;
            renderedBitrate.push({x: t, y: br});
        }

        [setThroughput, measuredThroughput, chosenBitrate, renderedBitrate].forEach(a => {
            if (a.length > 0 && a[a.length - 1].x > maxTime) {
                maxTime = a[a.length - 1].x;
            }
        });

        documentInfo.rebufferCount                = rebufferCount;
        documentInfo.rebufferCountAtLowestQuality = rebufferCountAtLowestQuality;
        documentInfo.rebufferCountAtHigherQuality = rebufferCountAtHigherQuality;
        documentInfo.rebufferAverage              = rebufferAverage;
        documentInfo.countSwitchUp                = countSwitchUp;
        documentInfo.totalSwitchUp                = totalSwitchUp;
        documentInfo.countSwitchDown              = countSwitchDown;
        documentInfo.totalSwitchDown              = totalSwitchDown;
        documentInfo.oscillationThreshold         = oscillationThreshold;
        documentInfo.oscillationCount             = oscillationCount;
        documentInfo.qualityDownloadHistogram     = qualityDownloadHistogram;
        documentInfo.maxSetThroughput             = maxSetThroughput;
        documentInfo.maxTime                      = maxTime;
        documentInfo.bitrates                     = bitrates;
        documentInfo.duration                     = duration;
        documentInfo.setThroughput                = setThroughput;
        documentInfo.measuredThroughput           = measuredThroughput;
        documentInfo.chosenBitrate                = chosenBitrate;
        documentInfo.renderedBitrate              = renderedBitrate;

        return documentInfo;
    }

    function generateOutputLog(doc, bitrates) {
        var startTime = parseTime(doc.wallclockTime);

        var outputLog = [];

        doc.metrics.forEach(function (element, index) {
            var info = null;

            var bufferLevel = element.bufferLevelVideo;
            if (bufferLevel === undefined) {
                // old entries
                bufferLevel = element.bufferLevel;
            }
            if (bufferLevel === null || isNaN(bufferLevel)) {
                bufferLevel = 0;
            }

            var out = [index,
                       't=' + (0.001 * (element.wallclockTime - startTime)).toFixed(3) + 's',
                       element.eventType,
                       'bufferLevel(+playhead)=' + bufferLevel.toFixed(3) + '(' + (element.playheadTime + bufferLevel).toFixed(3) + ')'];

            switch (element.eventType) {

            case 'bufferStalled':
                break;

            case 'bufferLoaded':
                break;

            case 'proxyChange':
                info = element.profileStepInfo;
                out.push((0.001 * Number(info.latency_ms)).toFixed(3) + 's', info.throughput_Mbps + 'Mbps');
                break;

            case 'fragmentLoadingCompleted':
                info = element.fragmentRequest;
                out.push('i=' + info.index,
                         'q=' + info.quality,
                         'loadAt=' + (info.delayLoadingTime > startTime ? (0.001 * (info.delayLoadingTime - startTime)).toFixed(3) : '*') + 's',
                         'size=' + (0.000008 * info.bytesTotal).toFixed(3) + 'Mbit',
                         'reqS/1stB/reqE(lat/dwl)=' +
                         (0.001 * (parseTime(info.requestStartDate) - startTime)).toFixed(3) + '/' +
                         (0.001 * (parseTime(info.firstByteDate) - startTime)).toFixed(3) + '/' +
                         (0.001 * (parseTime(info.requestEndDate) - startTime)).toFixed(3) + '(' +
                         (0.001 * (parseTime(info.firstByteDate) - parseTime(info.requestStartDate))).toFixed(3) + '/' +
                         (0.001 * (parseTime(info.requestEndDate) - parseTime(info.firstByteDate))).toFixed(3) + ')',
                         (0.008 * info.bytesTotal / (parseTime(info.requestEndDate) - parseTime(info.firstByteDate))).toFixed(3) + 'Mbps');
                break;

            case 'fragmentLoadingAbandoned':
                info = element.fragmentRequest;
                out.push('i=' + info.index,
                         'q=' + info.quality,
                         'loadAt=' + (info.delayLoadingTime > startTime ? (0.001 * (info.delayLoadingTime - startTime)).toFixed(3) : '*') + 's',
                         'size=' + (0.000008 * info.bytesLoaded).toFixed(3) + '/' + (0.000008 * info.bytesTotal).toFixed(3) + 'Mbit');
                if (element.switchReason) {
                    out.puth(element.switchReason.name);
                }
                break;

            case 'qualityChangeRequested':
            case 'qualityChangeStart': // old event name
                out.push(element.lastQualityLoaded + '->' + element.nextQualityLoading);
                if (bitrates) {
                    out.push('(' + (0.000001 * bitrates[element.lastQualityLoaded]).toFixed(3) + '->' + (0.000001 * bitrates[element.nextQualityLoading]).toFixed(3) + 'Mbps)');
                }
                if (element.switchReason) {
                    out.push(element.switchReason.name);
                    if (element.switchReason.throughput) {
                        if (element.switchReason.name === 'BolaRule' || element.switchReason.name === 'BolaAbandonRule') {
                            out.push('r.throughput=' + (0.000001 * element.switchReason.throughput).toFixed(3));
                        } else {
                            out.push('r.throughput=' + (0.001 * element.switchReason.throughput).toFixed(3));
                        }
                    }
                    if (element.switchReason.bufferLevel) {
                        out.push('r.bufferLevel=' + Number(element.switchReason.bufferLevel).toFixed(3));
                    }
                }
                break;

            }

            outputLog.push(out);
        });

        return outputLog;
    }

    return {
        init: init
    }

}

Main.prototype = {
    constructor:Main
}
