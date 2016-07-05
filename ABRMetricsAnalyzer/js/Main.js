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

        // TODO: write couch view to yield _id, id, group_id, wallclockTime, abr, fastSwitch
        // Note: below implementation is inefficient as it is written with above TODO in mind

        $.couch.db(dbName).allDocs({
            success: function(allData) {
                var elements = [];

                allData.rows.forEach(function (element, index) {
                    $.couch.db(dbName).openDoc(element.id, {
                        success: function(data) {

                            elements.push({_id: data._id, id: data.id, groupId: data.group_id, wallclock: data.wallclockTime, abr: data.abr, fastSwitch: data.fastSwitch});

                            if (elements.length === allData.total_rows) {

                                ////////////////////
                                // we now have all elements

                                elements.forEach(function (e) {
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

                                ////////////////////
                            }
                        }
                    });
                });
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

            var out = [index, (0.001 * (element.wallclockTime - startTime)).toFixed(3), element.bufferLevel, '(' + (element.playheadTime + element.bufferLevel).toFixed(3) + ')', element.eventType];

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
                out.push((0.001 * Number(info.latency_ms)).toFixed(3), info.throughput_Mbps);
                break;

            case 'fragmentLoadingCompleted':
                info = element.fragmentRequest;
                if (info.mediaType === 'video' && info.type === 'MediaSegment') {
                    info = element.fragmentRequest;
                    o.latency = parseTime(info.firstByteDate) - parseTime(info.requestStartDate);
                    // TODO: figure out latency - at the moment estimate throughput with the starting time being time of request rather than time of first byte
                    // o.throughput = 0.008 * info.bytesLoaded / (parseTime(info.requestEndDate) - parseTime(info.firstByteDate));
                    o.throughput = 0.008 * info.bytesLoaded / (parseTime(info.requestEndDate) - parseTime(info.requestStartDate));
                    o.index = info.index;
                    o.quality = info.quality;
                    o.startTime = 0.001 * (parseTime(info.requestStartDate) - startTime);
                    o.endTime = 0.001 * (parseTime(info.requestEndDate) - startTime);
                    o.bitrate = info.mediaInfo.bitrateList[info.quality].bandwidth;

                    o.dbIndex = index;
                    o.bytesLoaded = info.bytesLoaded;

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

                out.push(info.index, info.quality,
                         '(' + (info.delayLoadingTime > startTime ? (0.001 * (info.delayLoadingTime - startTime)).toFixed(3) : '.') + ')',
                         (0.001 * (parseTime(info.requestStartDate) - startTime)).toFixed(3), '/',
                         (0.001 * (parseTime(info.firstByteDate) - startTime)).toFixed(3), '/',
                         (0.001 * (parseTime(info.requestEndDate) - startTime)).toFixed(3));
                break;

            case 'qualityChangeStart':

                out.push(element.lastQualityLoaded, '->', element.nextQualityLoading);
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

        throughputChart = new Chart(ctx1, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'set throughput',
                        fill: false,
                        lineTension: 0,
                        data: setThroughput
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
                            max: 600
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
