NetworkProfilerService = function() {

    var tempProfile = {
        "profile": [
            {"index": "0", "duration_s": "20", "latency_ms": "128", "throughput_Mbps": "25.842"},
            {"index": "1", "duration_s": "20", "latency_ms": "63", "throughput_Mbps": "19.397"},
            {"index": "2", "duration_s": "20", "latency_ms": "77", "throughput_Mbps": "15.773"}
        ]
    };


    var document = new ProfilerDBDocument();

    function init() {
        $.couch.urlPrefix =  'http://dev-mediac-osqa01.kendall.corp.akamai.com:5984';



        var xhr = new XMLHttpRequest();
        xhr.open('GET', "http://edc.edgesuite.net", true);
        xhr.setRequestHeader('Access-Control-Allow-Origin', '*');
        xhr.setRequestHeader('Access-Control-Allow-Methods', 'GET');
        xhr.withCredentials = true
        xhr.overrideMimeType('text/xml');


        xhr.onreadystatechange = function() {
            console.log(xhr.response);
        }

        xhr.send();



        //
        //var doc = {
        //    uuid: "kevin-is-cool",
        //    date: "2-2-12",
        //    time: "asdfasdf",
        //    os: "win 95",
        //    browser: "netscape opera",
        //    profile: '{"asdfadsf": "asdfadf"}'
        //}
        //
        //$.couch.db("network_profiler").saveDoc(doc, {
        //    success: function(data) {
        //        console.log(data);
        //    },
        //    error: function(status) {
        //        console.log(status);
        //    }
        //});


        //create DB
        //$.couch.db("test1").create({
        //    success: function(data) {
        //        console.log(data);
        //
        //    },
        //    error: function(status) {
        //        console.log(status);
        //    }
        //});


        //Server Info
        //$.couch.db("test1").info({
        //    success: function(data) {
        //        console.log(data);
        //    }
        //});


    }

    return {
        init: init
    }

}


NetworkProfilerService.prototype = {
    constructor: NetworkProfilerService
}