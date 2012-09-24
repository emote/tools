"use strict";

var descs = require('./service.js').service;
var emproxy = require('emproxy');
var emsoap = require('emsoap');
var emutils = require('emutils');

var soaputils = emsoap.subsystems.soaputils;

var httpOptions = emutils.clone(descs.httpOptions);
var badEndpoint;

for (var typeName in descs.types) {
    var type = descs.types[typeName];
    if (type.baseTypeName) {
        type.baseType = descs.types[soaputils.makeQname(type.baseTypeNs, type.baseTypeName)];
    }
}

for (var opName in descs.operations) {
    var op = descs.operations[opName];
    if (op.requestDesc && op.requestDesc.parts) {
        op.requestDesc.parts.forEach(function(part) {
            if (part.xmlType) {
                part.type = descs.types[soaputils.makeQname(part.xmlTypeNs, part.xmlType)];
            }
        });
    }
    if (op.responseDesc && op.responseDesc.parts) {
        op.responseDesc.parts.forEach(function(part) {
            if (part.xmlType) {
                part.type = descs.types[soaputils.makeQname(part.xmlTypeNs, part.xmlType)];
            }
        });
    }
}

for (var typeName in descs.types) {
    var type = descs.types[typeName];
    type.content.forEach(function(item) {
        if (item.xmlType) {
            item.type = descs.types[soaputils.makeQname(item.xmlTypeNs, item.xmlType)];
        }
    });
}

emproxy.init(function afterInitCallback(initialConfig) {
    console.dir(initialConfig);
    if (initialConfig.endpoint) {
        httpOptions = emsoap.subsystems.httpRequest.parseUrl(initialConfig.endpoint);
        if (httpOptions) {
            httpOptions.method="POST";
        }
        else {
            badEndpoint = initialConfig.endpoint;
            console.log("Unable to parse the SOAP endpoint URL '" + initialConfig.endpoint + "' .");
            console.log("The proxy will be unable to communicate with the target service.");
            console.log("Please supply a correctly formatted URL.")
        }
    }
    if (httpOptions && initialConfig.usename) {
        httpOptions.auth = initialConfig.username + ":" + initialConfig.password;
    }

emproxy.start(processDirective);
});

function processDirective(restRequest,callback) {
    var found = false;
    if (restRequest.op === 'INVOKE' && restRequest.targetType === descs.serviceType) {
        var op = descs.operations[restRequest.name];
        if (op) {
            found = true;
            callSoapOperation(restRequest.params, op, callback);
        }
    }

    if (!found) {
        return callback(new Error("Unsupported request type."));
    }
}

function callSoapOperation(input, op, callback) {
    callSoap(input, httpOptions, op.requestDesc,
        op.deserializationOptions, op.responseDesc, callback);
}

function callSoap(input, httpOptions, requestDesc, deserOpts, responseDesc, cb) {
    if (badEndpoint) {
        cb(new Error("The proxy has been configured with the invalid endpoint '" + badEndpoint + "'"));
    }
    var opHttpOptions = emutils.clone(httpOptions);
    if (!opHttpOptions.headers) {
        opHttpOptions.headers = {};
    }
    opHttpOptions.headers.soapAction = requestDesc.soapAction;
    emsoap.call(input, httpOptions, requestDesc, deserOpts, responseDesc, function(err, result) {
        if (err) {
            cb(err);
        }
        else {
            var response = emutils.toArray(result);
            var restResponse = {
                status:"SUCCESS",
                count: response.length,
                results: response
            };
            cb(null, restResponse);
        }
    });
}
