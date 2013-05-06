"use strict";
var async = require('async');
var fs = require('fs');
var mms = require('./mms');
var util = require('util');

exports.cleanTenant = cleanTenant;
exports.cleanExternalSystem = cleanExternalSystem;
exports.execFile = execFile;
exports.getWsdl = getWsdl;
exports.updateCdmTypeDigest = updateCdmTypeDigest;

exports.remove = function(sessionParam,type,where,cb) {
    session = sessionParam;
    remove(type,where,cb);
}

var session;

function cleanTenant(sessionParam) {
    session = sessionParam;

    session.directive({
        op: 'SELECT',
        targetType: 'CdmExternalSystem',
        properties: ['id','name']
    },deleteResultList);

    session.directive({
        op: 'SELECT',
        targetType: 'CdmExternalCredentials',
        properties: ['id']
    },deleteResultList);

    session.directive({
        op: 'SELECT',
        targetType: 'CdmTypeBinding',
        properties: ['id']
    },deleteResultList);

    session.directive({
        op: 'SELECT',
        targetType: 'CdmPropertyBinding',
        properties: ['id']
    },deleteResultList);

    session.directive({
        op: 'SELECT',
        targetType: 'CdmTargetType',
        properties: ['id']
    },deleteResultList);
}

function cleanExternalSystem(sessionParam,extSysName) {
    session = sessionParam;

    if (!session.creds.username)
    {
        console.log("session.creds.username was null");
        process.exit(1);
    }

    async.series([
        function(cb) {
            session.directive({
                op: 'SELECT',
                targetType: 'CdmExternalSystem',
                properties: ['id','name'],
                where: {name: extSysName}
            },function(err,result) {
                deleteResultList(err,result,cb);
            });
        },
        function(cb) {
            session.directive({
                op: 'SELECT',
                targetType: 'CdmExternalCredentials',
                properties: ['id'],
                where: {username: session.creds.username, externalSystem: extSysName}
            },function(err,result) {
                deleteResultList(err,result,cb);
            });
        },
        function(cb) {
            session.directive({
                op: 'SELECT',
                targetType: 'CdmTypeBinding',
                properties: ['id'], 
                where: {externalSchema: extSysName} 
            },function(err,result) {
                deleteResultList(err,result,cb);
            });
        },
        function(cb) {
            session.directive({
                op: 'SELECT',
                targetType: 'CdmPropertyBinding',
                properties: ['id'], 
                where: {externalSchema: extSysName} 
            },function(err,result) {
                deleteResultList(err,result,cb);
            });
        },
        function(cb) {
            session.directive({
                op: 'SELECT',
                targetType: 'CdmTargetType',
                properties: ['id'], 
                where: {externalSystem: extSysName} 
            },function(err,result) {
                deleteResultList(err,result,cb);
            });
        }
    ],function(err,result) {
        console.log('Removed external systems and bindings for ' + extSysName + '.');
    });
}


function deleteResultList(err,result,cb) {
    if(!cb) cb = function(){};
    //console.dir(result);
    var query = [];
    result.results.forEach(function(row) {
        query.push({op: 'DELETE', targetType: row.targetType,where: {id: row.id}});
    });
    session.directive(query,cb);
}

function execFile(fileName,sessionParam,outputWriter,callback) {
    session = sessionParam;
    console.log("Exec'ing query file: " + fileName);

    var data;
    var json;

    try {
        data = fs.readFileSync(fileName);
    } catch(err) {
        console.log('Cannot read query file: ' + fileName);
        console.dir(err);
        process.exit(1);
        //return callback(err);
    }

    try {
        json = JSON.parse(data);
    } catch(err) {
        console.log('Query file does not contain JSON: ');
        console.dir(err);
        process.exit(1);
        //return callback(err);
    }

    if(!util.isArray(json)) {
        json = [json];
    }

    execArray(json,outputWriter,callback);    
}

function execArray(directives,outputWriter,callback) {
    async.forEachSeries(directives,
        function(directive, cb) {
            //console.log("Executing: ");
            //console.dir(directive);
            execDirective(directive,function(err,result) {
                if(outputWriter) {
                    outputWriter(err,result,cb);
                } else {
                    cb(err,result);
                }
            });
        },
        function(err, c) {
            if(err) {
                console.log(err.stack);
                console.dir(err);
            }
            console.log('Finished executing directives.');
            callback(err);
        }
    );
}

function execDirective(d,cb) {
    if(d.op == "INVOKE" && d.targetType == "CdmExternalSystem" && d.name == "createExternalSystem") {
        createExternalSystem(d,cb);
    } else if(d.op == "INVOKE" && d.targetType == "CdmType" && d.name == "replaceCdmType") {
        replaceCdmType(d,cb);
    } else if(d.op == "INVOKE" && d.targetType == "CdmType" && d.name == "bindCdmType") {
        bindCdmType(d,cb);
    }  else if(d.op == "INVOKE" && d.targetType == "CdmType" && d.name == "createCdmOperation") {
        createCdmOperation(d,cb);
    }  else if(d.op == "INVOKE" && d.targetType == "CdmType" && d.name == "deleteCdmOperations") {
        deleteCdmOperations(d,cb);
    } else if (d.assetType) {

        var data = fs.readFileSync(d.filename);

        d.file = {filename:d.filename, contents: data};

        session.console("updateGlobalAsset",d,function(err,result) {
            if(!err) {
                // do something if needed?
                console.log(result);
            }
            cb(err,result);
        });
    } else {
        session.directive(d,function(err,result) {
            if(!err) {
                // do something if needed?
            }
            cb(err,result);
        });
    }
}

function replaceCdmType(d,cb) {
    session.directive({
        op: 'INVOKE',
        targetType: 'CdmType',
        name: 'deleteCdmType',
            params: {
                typeName: d.params.typeName
            }
        },'rest.target.type.does.not.exist',
        function(err,result) {
            if(err) return cb(err);
            deleteCdmOperations(d, function(err) {
                if(err) return cb(err);
                d.name = 'createCdmType';
                session.directive(d,function(err) {
                    cb(err,result);
                });
            });
        });
}

function deleteCdmOperations(d, cb)
{
    var type = d.params.typeName;
    session.directive({
        op: 'INVOKE',
        targetType: 'CdmSimpleSchemaOperations',
        name : 'deleteCdmOperations',
        params : {
            typeName :d.params.typeName
        }
    }, cb);
}


function remove(type,where,cb) {
    session.directive({
        op: 'SELECT',
        targetType: type,
        properties: ['id'], 
        where: where 
    },function(err,result) {
        deleteResultList(err,result,cb);
    });    
}

function bindCdmType(d,callback) {
    var typeName = d.params.typeName;
    var externalType = d.params.externalType;
    var externalSystem = d.params.externalSystem;
    var bindingProps = {};

    for (var name in d.params) {
        if (name != 'typeName' && name != 'externalType' && name != 'externalSystem') {
            bindingProps[name] = d.params[name];
        }
    }


    session.directive({
        op: 'INVOKE',
        targetType: 'CdmSimpleSchemaOperations',
        name : 'bindCdmType',
        params: {cdmType: typeName,
            targetType: externalType,
            externalSystem: externalSystem,
            bindingProps: bindingProps
        }
    },  function(err, result) {
        if (!err) {
            console.log("Completed binding of CDM type: " + typeName);
        }
        callback(err, result)
    });

}

function updateCdmTypeDigest(session, cdmTypeName, digest, cb) {
    session.directive({
        op: 'INVOKE',
        targetType: 'CdmType',
        name: 'alterCdmType',
        params: {
            replace: true,
            typeName: cdmTypeName,
            dynamicCodeDigest: digest
        }
    }, cb);
}

function createExternalSystem(d,cb) {
    if (!session.creds.username)
    {
        console.log("session.creds.username was null");
        process.exit(1);
    }

    // Start by removing the existing CdmExternalSystem, if if exists
    remove('CdmExternalSystem',{name: d.params.name},function(err,result) {

        var createParams = {
            op: 'INSERT',
            targetType: 'CdmExternalSystem',
            values: {
                typeName: 'NODEX',
                accessAddress: ''
            }
        };

        for (var name in d.params) {
            if ((name != 'adminUsername') && (name != 'adminPassword') && (name != 'adminToken'))
            {
                createParams.values[name] = d.params[name];
            }
        }

        session.directive(createParams,function(err,result) {
            console.log('CREATED CdmExternalSystem: ' + d.params.name);
            //console.dir(result);

            if(d.params.adminUsername) {
                // If there is an adminUsername, then also create ExternalCredentials

                remove('CdmExternalCredentials',{
                    externalSystem: d.params.name,
                    username: session.creds.username
                },function(err,result) {
                    session.directive({
                        op: 'INSERT',
                        targetType: 'CdmExternalCredentials', 
                        values: {
                            externalUsername: d.params.adminUsername,
                            externalPassword: d.params.adminPassword,
                            externalToken: d.params.adminToken,
                            externalSystem: d.params.name,
                            validationState : 1,
                            username: session.creds.username
                        }
                    },cb);
                });
            } else {
                cb(err,result);
            }
        });
    });
}

function createCdmOperation(op, cb) {
    var opParams = {}
    for (var name in op.params) {
        if (name != "targetType" && name != "externalSystem") {
            opParams[name] = op.params[name];
        }
    }
    session.directive({
            op: 'INVOKE',
            targetType: 'CdmSimpleSchemaOperations',
            name: 'createAndBindCdmOperation',
            params:
            {
                targetType : op.params.targetType,
                operationProps: opParams
            } },
        function(err, result) {
            if (!err) {
                console.log("CREATED CdmOperation " + op.params.targetType + op.params.name);
            }
            cb(err, result);}
    );
}

function getWsdl(session, url, service, port, collection, cb) {
    session.directive({
            op: "INVOKE",
            targetType: "CdmTargetType",
            name: "parseWsdl",
            params: {
                url: url,
                service: service,
                port: port,
                wsdlCollection: collection }
        },
        cb
    );
}


