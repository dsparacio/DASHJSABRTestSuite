SessionInfo = function() {
    this.mpd = null;
    this.id = null;
    this.group_id = null;
    this.time = NaN;
    this.wallclockTime = NaN;
    this.abr =  null;
    this.fastSwitch = null;
    this.profile = null;
}

SessionInfo.prototype = {
    constructor: SessionInfo
};
