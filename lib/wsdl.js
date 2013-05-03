"use strict";

var fs = require("fs");
var mmscmd = require("./mmscmd");
var common = require("./common");
var create = require("./create");
var path = require('path');
var emutils = require('emutils');

var wsdlJsonFile = "wsdl.json";
var opsJsonFile = "wsdlOps.json";
var wsdlCollectionFile = "wsdlCollection.xml";
var modelFile = "model.json";
var proxyConfigFile = "proxyConfig.json";

var XSD_NS = "http://www.w3.org/2001/XMLSchema";
var SOAP_ENCODING_NS = 'http://schemas.xmlsoap.org/soap/encoding/';

exports.getWsdl = getWsdl;
exports.generate = generate;

function getWsdl(session, subProject, url, service, port, username, password, cb) {
    common.gotoProjectHome();
    var dir = "model" + path.sep + subProject + path.sep;
    common.insurePathExists(dir);
    process.chdir(dir);
    if (fs.existsSync(wsdlJsonFile)) {
        fs.unlinkSync(wsdlJsonFile);
    }
    if (fs.existsSync(opsJsonFile)) {
        fs.unlinkSync(opsJsonFile);
    }
    if (fs.existsSync(wsdlCollectionFile)) {
        fs.unlinkSync(wsdlCollectionFile);
    }
    session.login(function() {
        session.directive({
            op: "INVOKE",
            targetType: "WsdlTools",
            name: "getWsdlCollection",
            params: {
                wsdlUrl: url,
                username: username,
                password: password }
        }, function(err, result) {
            if (err) {
                return cb(err);
            }
            var wsdlCollection = result.results[0];
            fs.writeFileSync(wsdlCollectionFile, wsdlCollection);
            mmscmd.getWsdl(session, url, service, port, wsdlCollection, function (err, result) {
                if (!err) {
                    if (result.errors && result.errors[0]) {
                        err = result.errors[0];
                    }
                    else
                    {
                        var wsdl = result.results;
                        wsdl.description = {
                            wsdlUrl: url, wsdlService : service, wsdlPort : port,
                            wsdlUsername: username, wsdlPassword: password
                        }
                        fs.writeFileSync(wsdlJsonFile, JSON.stringify(wsdl, null, 2));
                        var ops = {operations:{}};
                        for (var name in common.getSorted(wsdl.operations)) {
                            ops.operations[name] = false;
                        }
                        fs.writeFileSync(opsJsonFile, JSON.stringify(ops, null, 2));
                        ensureConfigFileExists();
                    }
                }
                cb(err);
            });
        });
    });
}

function generate(session, subProject, cb) {
    common.gotoProjectHome();
    var home = process.cwd();
    createModel(session, subProject, function(err, model) {
        return cb(err);
    });
}

function createModel(session, subProject, cb) {
    var dir = "model/" + subProject + "/";
    var wsdl = null;
    var ops = null;
    var proxyConfig = null;
    try {
        process.chdir(dir);
        wsdl = readWsdlJsonFile();
        ops = readWsdlOpsJsonFile();
        proxyConfig = readProxyConfigFile();
        for (var name in wsdl.description) {
            proxyConfig[name] = wsdl.description[name];
        }
    }
    catch (ex){
        cb("The model files for the subproject '" + subProject + "' have become corrupted.  Use the getWsdl command to recreate them.")
        return;
    }
    if (!wsdl) {
        cb("The model files for the subproject '" + subProject + "' do not exist.  Use the getWsdl command to create them.")
        return;
    }

    var opCount = 0;
    for (var opName in ops.operations) {
        if (ops.operations[opName]) {
            opCount++;
        }
    }
    if (opCount == 0) {
        return cb(new Error("No operations were enabled"));
    }
    session.login(function() {
        session.directive({
                op: "INVOKE",
                targetType: "WsdlTools",
                name: "createWsdlModel",
                params: {
                    wsdl: wsdl,
                    opDefs: ops,
                    serviceName: subProject,
                    proxyConfig: proxyConfig }},
            function(err, result) {
                if (err) {
                    return cb(err);
                }
                var modelFileContents = [];
                var model = result.results[0];
                fs.writeFileSync("rawModel.json", JSON.stringify(model, null, 2));
                createExternalSystem(modelFileContents, model.accessAddress, model.proxyConfig, subProject);
                model.types.forEach(function(type) {
                    if (type.isEnum) {
                        createType(modelFileContents, type.name, null, false, null, type.values, type.baseType);
                    }
                    else {
                        createType(modelFileContents, type.name, type.properties, type.isEmbedded, subProject + "_ServiceType");
                        bindType(modelFileContents, type.name, subProject);
                        type.operations.forEach(function(op) {
                            addOperation(modelFileContents, type.name, op.name, subProject, op.returnType, op.parameters);
                        });
                    }
                });
                fs.writeFileSync(modelFile, JSON.stringify(modelFileContents, null, 2));
            });
    });
}

function ensureConfigFileExists() {
    if (!fs.existsSync(proxyConfigFile)) {
        var configProps = {
            soapAddress: null,
            username: null,
            password : null
        }
        fs.writeFileSync(proxyConfigFile, JSON.stringify(configProps, null, 2));
    }
}

function createExternalSystem(model, wsdlSoapAddress, proxyConfig, name) {
    var params = { name: name, globalPackageName : "wsdlProxy" };
    var endpoint = null;
    if (proxyConfig && proxyConfig.soapAddress) {
        endpoint = proxyConfig.soapAddress;
    }
    else if (wsdlSoapAddress) {
        endpoint = wsdlSoapAddress;
    }
    if (endpoint) {
        params.accessAddress = endpoint;
    }
    var pConfig = {};

    if (proxyConfig) {
        for (var name in proxyConfig) {
            var value = proxyConfig[name];
            if (value != null && value != undefined) {
                pConfig[name] = value;
            }
        }
    }
    params.proxyConfiguration = pConfig;

    model.push(
        {
            "op": "INVOKE",
            "targetType": "CdmExternalSystem",
            "name": "createExternalSystem",
            "params": params
        }
    )
}

function createType(model, name, props, isEmbedded, svcType, enumeratedValues, enumType) {
    var params;
    var propsCopy = emutils.cloneArray(props);
    propsCopy.forEach(function(row) {
        if (emutils.isReservedPropertyName(row.name)) {
            row.name = emutils.getCdmPropertyName(row.name);
        }
    });
    if (enumeratedValues) {
        var values = [];
        enumeratedValues.forEach(function(val) {
            values.push({"targetType" : "CdmEnumeration", "value":val, "label" : val});
        });
        params = {
            "typeName": name,
            "storage": "scalar",
            "scalarBaseType": getCdmType(enumType),
            "scalarInheritsFrom": getCdmType(enumType),
            "isEnumerated" : true,
            "isScalar" : true,
            "extensionAllowed": true,
            "externallySourced": true,
            "propertySet": propsCopy,
            "enumeration" : values
        };
    }
    else {
        params = {
            "typeName": name,
            "storage": (isEmbedded ? "embedded" : "virtual"),
            "baseTable": (isEmbedded ? svcType : undefined),
            "extensionAllowed": true,
            "externallySourced": true,
            "propertySet": props
        };
    }
    params.replace = true;
    model.push(
        {"op": "INVOKE",
            "targetType": "CdmType",
            "name": "deleteCdmOperations",
            "params": params
        });
    model.push(
        {"op": "INVOKE",
            "targetType": "CdmType",
            "name": "alterCdmType",
            "params": params
        });
}

function bindType(model, typeName, svcName) {
    model.push({
        "op": "INVOKE",
        "targetType": "CdmType",
        "name": "bindCdmType",
        "params": {
            "typeName": typeName,
            "externalType": typeName,
            "externalSystem": svcName,
            "readStrategy": "sync",
            "cacheMode": "direct",
            "sourceStrategy": "sync",
            "uniqueExternalId": true,
            "externalIdProperty": "id",
            "bindingStrategy": "matchPropertyNames"
        }
    });
}

function addOperation(model, typeName, opName, svcName, rtnType, params) {
    model.push({
        "op": "INVOKE",
        "targetType": "CdmType",
        "name": "createCdmOperation",
        "params": {
            "name" : opName,
            "targetType": typeName,
            "returnType": rtnType,
            "externalSystem": svcName,
            "parameters": params
        }
    });
}

function readWsdlJsonFile() {
    if (!fs.existsSync(wsdlJsonFile)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(wsdlJsonFile,'utf8'));
}

function readWsdlOpsJsonFile() {
    if (!fs.existsSync(opsJsonFile)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(opsJsonFile,'utf8'));
}

function readProxyConfigFile() {
    if (!fs.existsSync(proxyConfigFile)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(proxyConfigFile,'utf8'));
}

var cdmTypes =
{
    string: "String",
    number : "Real",
    boolean : "Boolean",
    date : "Date"
};

function getCdmType(jsonType) {
    var ctype = cdmTypes[jsonType];
    return ctype ? ctype : "String";
}
