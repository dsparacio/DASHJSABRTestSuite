var proxy = require('selenium-webdriver/proxy');
var webdriver = require('selenium-webdriver');
var capabilities = webdriver.Capabilities.chrome();
var driver = new webdriver.Builder().usingServer().withCapabilities(capabilities).setProxy(proxy.manual({http: '127.0.0.1:8008'})).build();

capabilities.applicationCacheEnabled = false;
driver.get("http://localhost:8000/index.html");







