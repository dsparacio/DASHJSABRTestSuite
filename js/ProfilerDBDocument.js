ProfilerDBDocument = function() {
    this.uuid = null;
    this.date =  null;
    this.user_info =  " ====> all header info from device call";
    this.start_epoch =  null;
    this.end_epoch =  null;
    this.client_rtt = null;
    this.bw = null;
    this.throughput = null;
    this.device_os = null;
    this.device_os_version = null;
    this.browser =  "===>brand_name";
    this.browser_version = null;
    this.device_id = null;
    this.city = null;
    this.county = null;
    this.country_code = null;
    this.region_code = null;
    this.georegion = null;
    this.timezone = null;
    this.is_mobile = null;
    this.is_tablet = null;
    this.is_wireless_device =  "==>mobile_browser_version";
    this.profile = null;
}

ProfilerDBDocument.prototype = {
    constructor: ProfilerDBDocument
}