var emproxy = require('emproxy');
var sforce = require('emsfdc');

emproxy.init(function afterInitCallback(initialConfig) {
    sforce.setInitialConfig(initialConfig);
    emproxy.start(sforce.processDirective);
});

