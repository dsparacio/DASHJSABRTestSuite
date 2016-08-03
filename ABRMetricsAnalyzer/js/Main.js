Main = function () {

    $.couch.urlPrefix =  'http://dev-mediac-osqa01.kendall.corp.akamai.com:5984';
    var DB_DEV = 'dashabr_test_results_dev';
    var DB_PROD = 'dashabr_test_results';

    var dbName = null;

    var groups = {};

    var ctx1;
    var ctx2;

    function init() {
        ctx1 = $("#chart1");
        ctx2 = $("#chart2");
        $("#button_load").click(loadDocument);
        $("#db_select").change(changeDatabase);
        $("#group_select").change(changeGroup);
        $("#id_select").change(changeId);

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
                    g.sort(function (a, b) { return a.wallclock - b.wallclock; });
                    g.firstWallclock = g[0].wallclock;
                });

                groups.sort(function (a, b) { return a.firstWallclock - b.firstWallclock; });

                groups.forEach(function (e, i) {
                    groups[e.groupId] = i;
                    var info = new Date(e.firstWallclock) + ' (' + e.length + ')';
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
        $("#id_select").empty();

        var groupIndex = groups[$("#group_select").val()];
        if (isNaN(groupIndex)) {
            return;
        }
        var g = groups[groupIndex];
        if (!g) {
            return;
        }

        g.forEach(function (e) {
            var info = 'ABR: ' + e.abr + ', fastSwitch: ' + e.fastSwitch;
            $("#id_select").append('<option value="' + e._id + '">' + info + '</option>');
        });

        changeId();
    }

    function changeId() {
    }

    function loadDocument() {
        var id = $("#id_select").val();
        if (!id) {
            return;
        }

        $.couch.db(dbName).openDoc(id, {
            success: function(data) {
                $("#id_info").html('ABR: ' + data.abr + ', fastSwitch: ' + data.fastSwitch);
                analyzeDocument(data);
            },
            error: function(status) {
                console.log('error:', status);
            }
        });
    }

    function parseTime(t) {
        return new Date(t).getTime();
    }

    var throughputChart = null;
    var qualityChart = null;

    function analyzeDocument(doc) {
        var startTime = parseTime(doc.wallclockTime);

        var proxySettings = [];
        var fragmentMeasurements = [];

        var rebufferAverage = 0;
        var rebufferCount = 0;
        var rebufferCountAtLowestQuality = 0;
        var rebufferCountAtHigherQuality = 0;
        var rebufferLastStalledTime = startTime;

        var bitrates = null;
        var qualityDownloadHistogram = null;

        var lastQuality = NaN;
        var lastSwitchTime = NaN;
        var lastSwitchUp = false;
        var totalSwitchUp = 0;
        var totalSwitchDown = 0;
        var countSwitchUp = 0;
        var countSwitchDown = 0;
        var oscillationThreshold = 10;
        var oscillationCount = 0;

        doc.metrics.forEach(function (element, index) {
            var o = {time: 0.001 * (element.wallclockTime - startTime)};
            var info = null;

            var bufferLevel = element.bufferLevelVideo;
            if (bufferLevel === undefined) {
                // old entries
                // TODO: eventually delete this block
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
                ++rebufferCount;
                if (element.lastQualityLoaded === 0) {
                    ++rebufferCountAtLowestQuality;
                } else {
                    ++rebufferCountAtHigherQuality;
                }
                rebufferLastStalledTime = element.wallclockTime;
                break;

            case 'bufferLoaded':
                if (rebufferCount > 0) {
                    rebufferAverage += (element.wallclockTime - rebufferLastStalledTime - rebufferAverage) / rebufferCount;
                }
                break;

            case 'proxyChange':
                info = element.profileStepInfo;
                o.latency = info.latency_ms;
                o.throughput = info.throughput_Mbps;
                o.duration = info.duration_s;
                proxySettings.push(o);
                out.push((0.001 * Number(info.latency_ms)).toFixed(3) + 's', info.throughput_Mbps + 'Mbps');
                break;

            case 'fragmentLoadingCompleted':
                info = element.fragmentRequest;
                if (info.mediaType === 'video' && info.type === 'MediaSegment') {
                    info = element.fragmentRequest;
                    o.latency = parseTime(info.firstByteDate) - parseTime(info.requestStartDate);
                    // TODO: figure out latency - at the moment estimate throughput with the starting time being time of request rather than time of first byte
                    o.throughput = 0.008 * info.bytesTotal / (parseTime(info.requestEndDate) - parseTime(info.firstByteDate));
                    // o.throughput = 0.008 * info.bytesTotal / (parseTime(info.requestEndDate) - parseTime(info.requestStartDate));
                    // r bytes/ms
                    // 8r bits/ms
                    // 8000r bits/s
                    // 0.008r Mbits/s
                    o.index = info.index;
                    o.quality = info.quality;
                    o.startTime = 0.001 * (parseTime(info.requestStartDate) - startTime);
                    o.endTime = 0.001 * (parseTime(info.requestEndDate) - startTime);
                    o.bitrate = info.mediaInfo.bitrateList[info.quality].bandwidth;

                    o.dbIndex = index;
                    o.bytesTotal = info.bytesTotal;

                    fragmentMeasurements.push(o);

                    if (!bitrates) {
                        bitrates = info.mediaInfo.bitrateList.map(el => el.bandwidth);
                        qualityDownloadHistogram = Array(bitrates.length).fill(0);
                    }

                    ++qualityDownloadHistogram[info.quality];

                    if (!isNaN(lastQuality) && lastQuality !== info.quality) {
                        if (!isNaN(lastSwitchTime) && info.startTime <= lastSwitchTime + oscillationThreshold) {
                            if (lastSwitchUp) {
                                if (info.quality < lastQuality) {
                                    ++oscillationCount;
                                }
                            } else {
                                if (info.quality > lastQuality) {
                                    ++oscillationCount;
                                }
                            }
                        }
                        lastSwitchTime = info.startTime;
                        lastSwitchUp = info.quality > lastQuality;
                        if (lastSwitchUp) {
                            ++countSwitchUp;
                            totalSwitchUp += bitrates[info.quality] - bitrates[lastQuality];
                        } else {
                            ++countSwitchDown;
                            totalSwitchDown -= bitrates[info.quality] - bitrates[lastQuality];
                        }
                    }
                    lastQuality = info.quality;
                }

                out.push('i=' + info.index,
                         'q=' + info.quality,
                         'loadAt=' + (info.delayLoadingTime > startTime ? (0.001 * (info.delayLoadingTime - startTime)).toFixed(3) : '*') + 's',
                         'size=' + (0.000008 * info.bytesTotal).toFixed(3) + 'Mbit',
                         'reqS/1stB/reqE(lat/dwl)=' +
                         (0.001 * (parseTime(info.requestStartDate) - startTime)).toFixed(3) + '/' +
                         (0.001 * (parseTime(info.firstByteDate) - startTime)).toFixed(3) + '/' +
                         (0.001 * (parseTime(info.requestEndDate) - startTime)).toFixed(3) + ' (' +
                         (0.001 * (parseTime(info.firstByteDate) - parseTime(info.requestStartDate))).toFixed(3) + '/' +
                         (0.001 * (parseTime(info.requestEndDate) - parseTime(info.firstByteDate))).toFixed(3) + ')',
                         (0.008 * info.bytesTotal / (parseTime(info.requestEndDate) - parseTime(info.firstByteDate))).toFixed(3) + 'Mbps');
                break;

            case 'qualityChangeStart':

                out.push(element.lastQualityLoaded + '->' + element.nextQualityLoading);
                if (bitrates) {
                    out.push('(' + (0.000001 * bitrates[element.nextQualityLoading]).toFixed(3) + 'Mbps)');
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
                }
                break;

            }

            console.log.apply(console, out);
        });

        var setThroughput = [];
        var setLatency = [];
        proxySettings.forEach(function (element, index) {
            setThroughput.push({x: element.time, y: element.throughput});
            setThroughput.push({x: (Number(element.time) + Number(element.duration)).toFixed(3), y: element.throughput});
            setLatency.push({x: element.time, y: element.latency});
            setLatency.push({x: (Number(element.time) + Number(element.duration)).toFixed(3), y: element.latency});
        });

        var measureThroughput = [];
        var measureLatency = [];
        fragmentMeasurements.forEach(function (element, index) {
            measureThroughput.push({x: element.startTime, y: element.throughput});
            measureThroughput.push({x: element.endTime, y: element.throughput});
            measureLatency.push({x: element.startTime, y: element.latency});
            measureLatency.push({x: element.endTime, y: element.latency});
        });

        var renderedQuality = [];
        fragmentMeasurements.forEach(function (element, index) {
            renderedQuality.push({x: index, y: element.quality});
            renderedQuality.push({x: index + 1, y: element.quality});
        });

        var sum_cb = function (cum, x) { return cum + x; };

        var table = '<table>';
        table += '<tr><td>rebuffers (low/other quality)</td><td>' + rebufferCount + ' (' + rebufferCountAtLowestQuality + '/' + rebufferCountAtHigherQuality + ')</td></tr>';
        table += '<tr><td>average rebuffer seconds</td><td>' + (0.001 * rebufferAverage).toFixed(3) + '</td></tr>';
        table += '<tr><td>up switches (in Mbps)</td><td>' + countSwitchUp + ' (' + (0.000001 * totalSwitchUp).toFixed(3) + ')' + '</td></tr>';
        table += '<tr><td>down switches (in Mbps)</td><td>' + countSwitchDown + ' (' + (0.000001 * totalSwitchDown).toFixed(3) + ')' + '</td></tr>';
        table += '<tr><td>oscillations within ' + oscillationThreshold + 's</td><td>' + oscillationCount + '</td></tr>';
        table += '<tr><td>average bitrate in Mbps</td><td>' + (0.000001 * qualityDownloadHistogram.map(function (x, i) {return x * bitrates[i];}).reduce(sum_cb) / qualityDownloadHistogram.reduce(sum_cb)).toFixed(3) + '</td></tr>';
        table += '<tr><td></td><td></td></tr>';
        table += '</table>';

        $("#stats").html(table);

        if (throughputChart) {
            throughputChart.destroy();
        }

        var max = NaN;
        if (setThroughput.length > 0) {
            if (measureThroughput.length > 0) {
                max = Math.max(setThroughput[setThroughput.length - 1].x, measureThroughput[measureThroughput.length - 1].x);
            } else {
                max = setThroughput[setThroughput.length - 1].x;
            }
        } else {
            if (measureThroughput.length > 0) {
                max = measureThroughput[measureThroughput.length - 1].x;
            }
        }
        if (isNaN(max)) {
            max = 1;
        }

        throughputChart = new Chart(ctx1, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'set throughput',
                        fill: false,
                        lineTension: 0,
                        data: setThroughput,
                        borderColor: 'rgba(192,0,0,0.9)'
                    },
                    {
                        label: 'measured throughput',
                        fill: false,
                        lineTension: 0,
                        data: measureThroughput,
                        borderColor: 'rgba(0,0,0,0.9)'
                    }
                ]
            },
            options: {
                scales: {
                    xAxes: [{
                        type: 'linear',
                        position: 'bottom',
                        ticks: {
                            min: 0,
                            max: max
                        }
                    }]
                },
                pan: {
                    enabled: true,
                    mode: 'xy'
                },
                zoom: {
                    enabled: true,
                    mode: 'xy'
                }
            }
        });

        if (qualityChart) {
            qualityChart.destroy();
        }

        qualityChart = new Chart(ctx2, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'rendered quality',
                        fill: false,
                        lineTension: 0,
                        data: renderedQuality,
                        borderColor: 'rgba(0,0,0,0.9)'
                    }
                ]
            },
            options: {
                scales: {
                    xAxes: [{
                        type: 'linear',
                        position: 'bottom',
                        ticks: {
                            min: 0,
                            max: renderedQuality.length / 2
                        }
                    }],
                    yAxes: [{
                        type: 'linear',
                        ticks: {
                            min: -0.5,
                            max: bitrates.length - 0.5
                        }
                    }]
                },
                pan: {
                    enabled: true,
                    mode: 'xy'
                },
                zoom: {
                    enabled: true,
                    mode: 'xy'
                }
            }
        });
    }

    return {
        init: init
    }

}

Main.prototype = {
    constructor:Main
}
