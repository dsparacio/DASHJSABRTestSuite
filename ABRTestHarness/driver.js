var proxy = require('selenium-webdriver/proxy');
var webdriver = require('browserstack-webdriver');

var capabilities = {
    "browserName": "Chrome",
    "os": "Windows",
    "os_version": "7",
    'resolution' : '1024x768',
    'browserstack.local': true,
    'browserstack.debug': true,
    'applicationCacheEnabled' : false
}



var driver = new webdriver.Builder()
    .usingServer('http://hub.browserstack.com/wd/hub')
    .withCapabilities(capabilities)
    .build();


driver.get("http://localhost:8000/ABRTestHarness/index.html");











