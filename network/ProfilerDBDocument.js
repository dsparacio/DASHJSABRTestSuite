ProfilerDBDocument = function() {
    //program defined
    this.uuid = null;
    this.date =  null;
    this.start_epoch =  null;
    this.end_epoch =  null;

    //edgescape - currently using http://ipinfo.io/json
    this.city = null;
    this.country = null;
    this.hostname = null;
    this.ip = null;
    this.loc = null;
    this.org = null;
    this.postal = null;
    this.region = null;
    this.profile = null;

    //JS device and evn info


    //User defined info
    this.username = null;
    this.email = null;
    this.networkType = null;
}

ProfilerDBDocument.prototype = {
    constructor: ProfilerDBDocument
}