"use strict";
var async = require('async');
var fs = require('fs');
var mms = require('./mms');
var util = require('util');

exports.cleanTenant = cleanTenant;
exports.execFile = execFile;
exports.getWsdl = getWsdl;
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

    session.onDirectivesComplete(function(err) {
        console.log('Previous configurations removed from tenant.');
    });
}

function cleanExternalSystem(session,extSysName) {
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
                where: {username: session.username, externalSystem: extSysName} 
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
        console.log('Previous configuration of ExternalSystem ' + extSysName + ' removed');
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
            deleteCdmOperations(d.params.typeName, function(err) {
                if(err) return cb(err);
                d.name = 'createCdmType';
                session.directive(d,function(err) {
                    cb(err,result);
                });
            });
        });
}

function deleteCdmOperations(type, cb)
{
    session.directive({
        op: 'SELECT',
        targetType: 'CdmOperation',
        properties: ['name'],
        where: {objectType: type}
    }, function(err,result) {
        if (err) return cb(err);
        async.forEachSeries(
            result.results,
            function(row, rcb) {
                session.directive({
                    op: 'INVOKE',
                    targetType: 'CdmOperation',
                    name: "deleteOperation",
                    params:
                    {
                        typeName: type,
                        name : row.name
                    }
                }, function(err, result) {
                    if (err) {
                        console.log(err);
                    }
                    deleteCdmOperationBinding(type, row.name, rcb);
                });
            }, cb);
    });
}

function deleteCdmOperationBinding(type, opName, cb) {
    session.directive({
        op: 'SELECT',
        targetType: 'CdmOperationBinding',
        properties: ['id'],
        where: {cdmType: type, cdmOperation : opName}
    },function(err,result) {
        if (err) {
            console.log(err);
        }
        deleteResultList(err,result, function() {
            deleteCdmTargetOperationBinding(type, opName, cb)
        });
    });
}

function deleteCdmTargetOperationBinding(type, opName, cb) {
    session.directive({
        op: 'SELECT',
        targetType: 'CdmTargetOperation',
        properties: ['id'],
        where: {name: opName, objectType : type}
    },function(err,result) {
        if (err) {
            console.log(err);
        }
        deleteResultList(err,result,cb);
    });
}
function getTypesFromDirectives(directives) {
    var model = {testArr:[]};
    directives.every(function(item) {
        if(item.name == 'replaceCdmType') {
            model.testArr.push(item.params.typeName);
        }
        return true;
    });
    return model;
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
    var cdmProperties;
    var propList;

    async.series([
        function(cb) { // Get list of properties for the CdmType
            session.directive({
                op: 'SELECT',
                targetType: 'CdmProperty',
                properties: ['id','name','type'],
                where: {containingType: typeName}
            },function(err,result) {
                if(err) return cb(err);

                cdmProperties = result.results;
                propList = [];
                cdmProperties.forEach(function(row) {
                    propList.push({name: row.name, type: row.type});
                });
                cb();
            });
        },
        function(cb) { // remove the CdmTargetType, if it already exists
            remove('CdmTargetType',{name: externalType},cb);
        },
        function(cb) { // Create the CdmTargetType
            session.directive({
                op: 'INSERT',
                targetType: 'CdmTargetType',
                values: {
                    name: externalType,
                    externalSystem: externalSystem,
                    properties: propList
                }
            },cb);
        },
        function(cb) { // remove the CdmTypeBinding, if it already exists
            remove('CdmTypeBinding',{name: typeName},cb);
        },
        function(cb) { // remove the CdmPropertyBindings, if they exist
            remove('CdmPropertyBinding',{cdmType: typeName},cb);
        },
        function(cb) { // Create the CdmTypeBinding
            session.directive({
                op: 'INSERT',
                targetType: 'CdmTypeBinding', 
                values: {
                    name: typeName, 
                    externalType: externalType, 
                    externalSchema: externalSystem, 
                    readStrategy: d.params.readStrategy, 
                    readPeriod: d.params.readPeriod,
                    cacheMode: d.params.cacheMode, 
                    sourceStrategy: d.params.sourceStrategy, 
                    writeStrategy: d.params.writeStrategy, 
                    uniqueExternalId: d.params.uniqueExternalId  
                }
            },cb);
        },
        function(cb) { // Create the CdmPropertyBindings

            console.log('Inserted CdmTypeBinding: ' + externalType);

            async.forEachSeries(cdmProperties,
                function(bindProp,cb2) {
                    session.directive({
                        op: 'INSERT',
                        targetType: 'CdmPropertyBinding', 
                        values: {
                            cdmType: typeName, 
                            cdmProperty: bindProp.name, 
                            externalType: externalType, 
                            externalProperty: bindProp.name, 
                            externalSchema: externalSystem 
                        }
                    },cb2);
                },
               cb
            );
        }
    ],
    function(err) {
        if(err) {
            console.log('Encountered error while binding CDM type: ' + err);
            console.log('Cleaning external system ' + externalSystem + ' is recommended.');
            process.exit(1);
        } else {
            console.log('Completed binding of CDM type: ' + typeName)
        }
        callback(err);
    });  
}

function createExternalSystem(d,cb) {
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
            createParams.values[name] = d.params[name];
        }
        session.directive(createParams,function(err,result) {
            console.log('CREATED CdmExternalSystem: ' + d.params.name);
            //console.dir(result);

            if(d.params.adminUsername) {
                // If there is an adminUsername, then also create ExternalCredentials

                remove('CdmExternalCredentials',{
                    externalSystem: d.params.name,
                    username: session.username
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
                            username: session.username
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
    session.directive({
        op: 'INVOKE',
        targetType: 'CdmOperation',
        name: 'createOperation',
        params:
        {
            objectType: op.params.targetType,
            name: op.params.name,
            returnType: op.params.returnType,
            parameters : op.params.parameters,
            location : op.params.location
        }
    }, function() {

        session.directive({
                op: 'INSERT',
                targetType: 'CdmOperationBinding',
                values: {
                    externalType: op.params.targetType,
                    cdmType: op.params.targetType,
                    externalSchema: op.params.externalSystem,
                    externalOperation: op.params.name,
                    cdmOperation: op.params.name
                }
            }, function() {

                session.directive({
                    op: 'INSERT',
                    targetType: 'CdmTargetOperation',
                    values: {
                        objectType : op.params.targetType,
                        returnType: op.params.returnType,
                        name: op.params.name,
                        externalSystem: op.params.externalSystem,
                        description: op.params.description,
                        parameters : op.params.parameters
                    }
                }, function(err, result){
                    if (!err) {
                        console.log('CREATED CdmOperation: ' + op.params.targetType + "." + op.params.name + "()");
                    }
                    cb(err, result);
                })
            })
    })
}

function getWsdl(session, url, service, port, username, password, collection, cb) {
    session.directive({
            op: "INVOKE",
            targetType: "CdmTargetType",
            name: "parseWsdl",
            params: {
                url: url,
                service: service,
                port: port,
                username: username,
                password: password,
                wsdlCollection: collection }
        },
        cb
    );
}


