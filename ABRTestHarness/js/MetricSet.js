MetricSet = function() {
    this.sessionInfo = {};
    this.eventType = null;
    this.eventTime = NaN;
    this.wallclockTime = NaN;
    this.bufferLevel = NaN;
    this.playheadTime = NaN;
    this.lastQualityLoaded = NaN;
    this.nextQualityLoading = NaN;  //(if this value is not NaN then it means quality change event occurred )
    this.switchReason = null;
    this.isUpShiftInQuality = null;
    this.fragmentRequest = null;
    this.fragmentRequestError = null;
    this.profileStepInfo = null;
}

MetricSet.prototype = {
    constructor: MetricSet
};
