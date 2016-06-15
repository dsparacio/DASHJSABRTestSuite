ProfilerDBDocument = function() {
    //User defined info
    this.username = null;
    this.email = null;
    this.network_type = null;

    //program defined
    this.guid = null;
    this.date =  null;
    this.timezone_offset = null;
    this.start_epoch =  null;
    this.end_epoch =  null;
    this.city = null;
    this.country = null;
    this.hostname = null;
    this.ip = null;
    this.loc = null;
    this.org = null;
    this.postal = null;
    this.region = null;
    this.profile = null;
    this.browser_name = null;
    this.browser_fullVersion = null;
    this.browser_majorVersion = null;
    this.browser_minorVersion = null;
    this.os_name = null;
    this.os_vender = null;
    this.os_fullVersion = null;
    this.os_majorVersion = null;
    this.os_minorVersion = null;
    this.userAgent = null;
    this.viewport_height = null;
    this.viewport_width = null;
    this.viewport_orientation = null;
}

ProfilerDBDocument.prototype = {
    constructor: ProfilerDBDocument
}