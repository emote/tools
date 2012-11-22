var emproxy = require('emproxy');
var sforce = require('emsfdc');

emproxy.init(function afterInitCallback(initialConfig) {
    emproxy.start(sforce.processDirective);
});

