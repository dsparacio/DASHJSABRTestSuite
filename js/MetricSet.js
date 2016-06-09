MetricSet = function() {
    this.sessionInfo = {};
    this.eventType = null;
    this.eventTime = NaN;
    this.wallclockTime = NaN;
    this.bufferLevel = NaN;
    this.bufferTarget = NaN; //would like to be able to capture this
    this.playheadTime = NaN;
    this.lastQualityLoaded = NaN;
    this.nextQualityLoading = NaN;  //(if this value is not NaN then it means quality change event occurred )
    this.bandwidth = NaN;
    this.isUpShiftInQuality = null;
}

MetricSet.prototype = {
    constructor: MetricSet
};
