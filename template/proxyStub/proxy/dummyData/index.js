var util = require('util');
var genericproxy = require('emproxy');

var types = substitute0/* JSON.stringify(subject.types, null, '\t') */;

var count = 1;

function processDirective(restRequest,callback) {
    var type = types[restRequest.targetType]

    if(!type) {
        return callback(new Error("Request for unknown type: " + type));
    }

    var row = {externalId: new Date().getTime()};
    for(var name in type) {
        row[name] = name + count;
        count += 1;
    }

    var restResult = {
        targetType : 'RestResult',
        status : 'SUCCESS',
        count : 1,
        results : [row]
    };

    console.dir(restResult);
    callback(null,restResult);
}

genericproxy.init(function afterInitCallback(initialConfig) {
    genericproxy.start(processDirective);
});
