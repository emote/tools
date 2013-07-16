"use strict";
var async = require('async');
var fs = require('fs');
var util = require('util');
var prompt = require('prompt');
var httpRequest = require('emsoap').subsystems.httpRequest;

var common = require('./common');
var mms = require('./mms');
var mmscmd = require('./mmscmd');
var deploy = require('./deploy');

var session; // MMS session
var modelFile = "sfmodel.json";

var externalSystemType = 'NODEX';
var externalSystem;
var accessAddress;
var credentials;
var mappedObjects;
var verboseLoggingForExternalSystem;

function afterAuth(cb) {
    // munge mappedObjects as required
    for (var name in mappedObjects) {
        var map = mappedObjects[name];
        if (!map.typeBindingProperties) {
            map.typeBindingProperties = {};

            for (var propName in map) {
                switch(propName) {
                    case "target":
                    case "properties":
                        ;

                    default:
                        map.typeBindingProperties[name] = map[name];
                }
            }
        }
    }
    // invoke op to create model
    session.directive(
        {
            op : "INVOKE",
            targetType: "CdmExternalSystem",
            name: "invokeExternal",
            params: {
                externalSystem: externalSystem,
                opName : "createSfModel",
                params : {
                    sfVersion : credentials.sfVersion,
                    externalSystem : externalSystem,
                    typeDescs : mappedObjects
                }
            }
        },
        function (err, result) {
            if (err) {
                return cb(err);
            }
            fs.writeFileSync(modelFile, JSON.stringify(result.results, null, 2));
            mmscmd.execFile(modelFile,session, deploy.outputWriter, cb);
        }
    );
}


exports.deployModel = function deployModel(externalSystemName,mmsSession,cb) {
    session = mmsSession;
    externalSystem = externalSystemName;
    var text;

    if(!session.creds.externalCredentials) {
        console.log("Profile must include externalCredentials");
        process.exit(1);
    }

    credentials = session.creds.externalCredentials[externalSystemName];
    if(!credentials) {
        console.log("Profile does not provide externalCredentials for " + externalSystemName);
        process.exit(1);
    }

    if(!credentials.oauthKey || !credentials.oauthSecret) {
        console.log("externalSystemName for " + externalSystemName + " must contain the oAuth key and secret.");
    }
    accessAddress = credentials.host;

    try {
        text = fs.readFileSync("salesforce.json");
    } catch(err) {
        console.log('Error reading file salesforce.json:' + err);
        process.exit(1);
    }
    try {
        mappedObjects = JSON.parse(text);
    } catch(err) {
        console.log('Error parsing JSON in salesforce.json:' + err);
        process.exit(1);
    }

    if(mappedObjects._verbose_logging_) {
        verboseLoggingForExternalSystem = mappedObjects._verbose_logging_;
    }
    delete mappedObjects._verbose_logging_;


    createExternalSystem(function(err) {
        if (err) {
            return cb(err);
        }
        var addr = common.global.session.creds.server + "/oauth/" + externalSystem + "/authenticate";

        if (common.global.argv.nonInteractive) {
            console.log("Note: what follows will fail unless Emotive has been authorized at " + addr);
            afterAuth(cb);
        }
        else {
            console.log("Please navigate to " + addr.underline + " with your browser");
            prompt.start();
            prompt.colors = false;
            prompt.message = 'Press Enter when done';
            prompt.delimiter = '';
            var props = {
                properties: {
                    q: {
                        description : ":"
                    }
                }
            }
            prompt.get(props, function (err, result) {
                if (err) {
                    return cb(err);
                }
                afterAuth(cb);
            });
        }
    });
}


function createExternalSystem(cb) {

    if (!session.creds.username)
    {
        console.log("session.creds.username was null");
        process.exit(1);
    }

    if(verboseLoggingForExternalSystem) console.log('VERBOSE LOGGING IS ON FOR ' + externalSystem);

    session.directive({
            op: 'INVOKE',
            targetType: 'CdmExternalSystem',
            name: "updateOAuthExternalSystem",
            params: {
                name: externalSystem,
                typeName: externalSystemType,
                "oauthCredentials" : {
                    "oauthType": "salesforce",
                    "oauthKey": credentials.oauthKey,
                    "oauthSecret": credentials.oauthSecret
                },
                properties: {
                    proxyConfiguration: {verbose: verboseLoggingForExternalSystem, sfVersion: credentials.sfVersion},
                    globalPackageName : "sfProxy"
                }
            }
        },
        cb);
}
