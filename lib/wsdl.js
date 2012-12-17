"use strict";

var fs = require("fs");
var mmscmd = require("./mmscmd");
var common = require("./common");
var create = require("./create");
var wsdlcollection = require('emsoap').subsystems.wsdlcollection;
var path = require('path');
var emutils = require('emutils');

var wsdlJsonFile = "wsdl.json";
var opsJsonFile = "wsdlOps.json";
var wsdlCollectionFile = "wsdlCollection.xml";
var modelFile = "model.json";
var proxyConfigFile = "proxyConfig.json";
var proxyServiceFile = "service.js";

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
        fs.unlink(wsdlCollectionFile);
    }
    session.login(function() {
        wsdlcollection.makeWsdlCollection(wsdlCollectionFile, url, username, password, function(err) {
            if (err) {
                return console.log(err);
            }

            mmscmd.getWsdl(session, url, service, port, fs.readFileSync(wsdlCollectionFile).toString(),
                function(err, result) {
                if (!err) {
                    if (result.errors && result.errors[0]) {
                        err = result.errors[0];
                    }
                    else if (result.results.errorMessage) {
                        err = result.results.errorMessage;
                    }
                    else
                    {
                        var wsdl = result.results.result;
                        wsdl.description = {
                            subProject: subProject, wsdlUrl: url, service : service, port : port
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

function generate(subProject, cb) {
    common.gotoProjectHome();
    var home = process.cwd();
    createModel(subProject, function(err, model) {
        if (err) {
            return cb(err);
        }
        process.chdir(home);
        createProxy(subProject, model, function(err) {
            if (err) {
                return cb(err);
            }
            process.chdir(home);

            var modelInit = readProjectJsonFile();
            modelInit.target = subProject;
            create.add("proxy", subProject, "wsdl", cb);
        });
    });
}

function createModel(subProject, cb) {
    var dir = "model/" + subProject + "/";
    var wsdl = null;
    var ops = null;
    try {
        process.chdir(dir);
        wsdl = readWsdlJsonFile();
        ops = readWsdlOpsJsonFile();
    }
    catch (ex){
        cb("The model files for the subproject '" + subProject + "' have become corrupted.  Use the getWsdl command to recreate them.")
        return;
    }
    if (!wsdl) {
        cb("The model files for the subproject '" + subProject + "' do not exist.  Use the getWsdl command to create them.")
        return;
    }

    wsdl.typeDirectory = createTypeDirectory(wsdl);

    var svcName = subProject;
    var svcTypeName = svcName + "_ServiceType";

    var model = [];
    createType(model, svcTypeName, [], false, svcTypeName);
    bindType(model, svcTypeName, svcName);

    var allOps = [];
    var allModelTypes = {};
    var otherTypes = {};
    var numOps = 0;
    for (var opName in ops.operations) {
        if (ops.operations[opName]) {
            numOps++;
            var allParams = [];
            var op = wsdl.operations[opName];
            var inputParts =  [];
            var outputParts = [];
            var opdesc = {operation: op, inputParts: inputParts, outputParts: outputParts};
            allOps.push(opdesc);
            if (op.input) {
                simplifyRequestParams(wsdl, op.input);
                var isEncoded = op.input.use == "ENCODED";
                var params = op.input.params ? op.input.params : op.input.parts;
                params.forEach(function(part) {
                    processPart(wsdl, part, inputParts, allModelTypes, otherTypes, isEncoded);
                });
            }
            if (op.output) {
                unwrapResponse(wsdl, op.output);
                var isEncoded = op.output.use == "ENCODED";
                op.output.parts.forEach(function(part) {
                    processPart(wsdl, part, outputParts, allModelTypes, otherTypes, isEncoded);
                });
            }
            var rtnType;
            if (outputParts.length > 0) {
                rtnType = outputParts[0].typeName;
                if (outputParts.length > 1) {
                    rtnType = opName + "__returnType";
                    var rtnTypeProps = [];
                    outputParts.forEach(function(outPart) {
                        rtnTypeProps.push(
                            {
                                "name": outPart.name,
                                "typeName": outPart.typeName,
                                "targetType": "CdmParameter",
                                "cardinality": "one"
                            }
                        );
                    });
                    createType(model, rtnType, rtnTypeProps, false, svcTypeName)
                }
            }
            addOperation(model, svcTypeName, op.name, svcName, rtnType, inputParts);
        }
    }
    if (numOps == 0) {
        return cb("No operations were enabled.  Please edit the model/" + subProject + "/" + opsJsonFile + " file.")
    }
    var proxyConfig = readProxyConfigFile();
    createExternalSystem(model, wsdl.soapAddress, proxyConfig, svcName);

    for (var tname in allModelTypes) {
        var type = allModelTypes[tname];
        createType(model, type.typeName, type.propertySet, type.isEmbedded, svcTypeName,
                   type.type.enumeratedValues, type.type.jsonType);
        bindType(model, type.typeName, svcName);
    }

    if (fs.existsSync(modelFile)) {
        fs.unlinkSync(modelFile);
    }
    fs.writeFileSync(modelFile, JSON.stringify(model, null, 2));
    cb(null, {wsdl : wsdl, allOps : allOps, allModelTypes: allModelTypes, otherTypes : otherTypes, serviceType: svcTypeName});
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

function createProxy(subProject, model, cb) {
    var dir = "proxy" + path.sep + subProject + path.sep;
    common.insurePathExists(dir);
    process.chdir(dir);

    var service =
    {
        serviceType: model.serviceType,
        httpOptions:
        {
            hostname : model.wsdl.soapAddress.hostname,
            port : model.wsdl.soapAddress.port,
            path: model.wsdl.soapAddress.path,
            isHttps: model.wsdl.soapAddress.isHttps,
            method: "POST"
        },
        types: {},
        operations: {}
    }

    for (var name in model.allModelTypes) {
        var type = model.allModelTypes[name].type;
        if (!type.enumeratedValues) {
            service.types[makeQualifiedName(type.ns, type.name)] = type;
        }
    }

    for (var name in model.otherTypes) {
        var type = model.otherTypes[name].type;
        service.types[makeQualifiedName(type.ns, type.name)] = type;
    }

    for (var typeName in service.types) {
        var type = model.wsdl.types[typeName];
        if (type.content) {
            type.content.forEach(function(item, index, array) {
                if (item.xmlTypeNs) {
                    var itemType = model.wsdl.types[makeQualifiedName(item.xmlTypeNs, item.xmlType)];
                    if (itemType.baseTypeName == "Array" && itemType.baseTypeNs == SOAP_ENCODING_NS) {
                        item.isArray = true;
                        item.isEnum = itemType.content[0].isEnum;
                        item.xmlTypeNs = itemType.content[0].xmlTypeNs;
                        item.xmlType = itemType.content[0].xmlType;
                        item.jsonType = itemType.content[0].jsonType;
                    }
                }
                if (item.isEnum) {
                    var copy = emutils.clone(item);
                    delete copy.xmlType;
                    delete copy.xmlTypeNs;
                    array[index] = copy;
                }
                if (emutils.isReservedPropertyName(item.name)) {
                    item.jsName = emutils.getCdmPropertyName(item.name);
                };
            });
        }
    }

    model.allOps.forEach(function(modelOp) {
        var operation = modelOp.operation;
        var opName = operation.name;
        var isRpc;
        if (operation.style) {
            isRpc = operation.style == "RPC";
        }
        else {
            isRpc = model.wsdl.style == "RPC";
        }
        var descOp = {};
        service.operations[opName] = descOp;

        if (operation.input) {
            var isEncoded = operation.input.use == "ENCODED";
            descOp.requestDesc =
            {
                opName : opName,
                opNs: operation.namespace ? operation.namespace : model.wsdl.namespace,
                soapAction: operation.soapAction,
                isEncoded: isEncoded,
                isRpc : isRpc,
                soapVersion : model.wsdl.version,
                parts: operation.input.parts
            }
            if (operation.input.params) {
                descOp.inputParams = {};
                operation.input.params.forEach(function(param) {
                    descOp.inputParams[param.name] = param;
                });
            }
            descOp.requestDesc.parts.forEach(function(part) {
                if (part.elementName) {
                    var elm = model.wsdl.elements[makeQualifiedName(part.elementNs, part.elementName)];
                    part.xmlType = elm.xmlType;
                    part.xmlTypeNs = elm.xmlTypeNs;
                }
                if (part.xmlType) {
                    var partTypeName = makeQualifiedName(part.xmlTypeNs, part.xmlType);
                    var partType = model.wsdl.types[partTypeName];
                    if (!service.types[partTypeName]) {
                        service.types[partTypeName] = partType;
                    }
                }
                if (emutils.isReservedPropertyName(part.name)) {
                    part.jsName = emutils.getCdmPropertyName(part.name);
                };
            });
        }

        if (operation.output) {
            var isEncoded = operation.output.use == "ENCODED";
            descOp.deserializationOptions =
            {
                removeEnvelope : true,
                soapEncoded: isEncoded,
                skipLevels: operation.output.skipLevels
            };
            descOp.responseDesc =
            {
                isEncoded: isEncoded,
                isRpc : isRpc,
                parts: operation.output.parts
            };
            descOp.responseDesc.parts.forEach(function(part) {
                if (part.elementName) {
                    var elm = model.wsdl.elements[makeQualifiedName(part.elementNs, part.elementName)];
                    part.xmlType = elm.xmlType;
                    part.xmlTypeNs = elm.xmlTypeNs;
                }
                if (emutils.isReservedPropertyName(part.name)) {
                    part.jsName = emutils.getCdmPropertyName(part.name);
                };
            });

        }
    })

    if (fs.existsSync(proxyServiceFile)) {
        fs.unlinkSync(proxyServiceFile);
    }

    fs.writeFileSync(proxyServiceFile, "exports.service =\n" + JSON.stringify(service, null, 2));
    cb();
}

function processPart(wsdl, part, allParts, allModelTypes, otherTypes, isEncoded) {
    var type;

    var desc;
    if (part.elementName) {
        var elm = wsdl.elements[makeQualifiedName(part.elementNs, part.elementName)];
        desc = getTypeDescFromName(wsdl, elm.jsonType, elm.isEnum, elm.xmlTypeNs, elm.xmlType);
    }
    else {
        desc = getTypeDescFromName(wsdl, part.jsonType, part.isEnum, part.xmlTypeNs, part.xmlType);
    }
    allParts.push({name : part.name, typeName: desc.ctype, targetType : "CdmParameter", cardinality : desc.isArray ? "many" : "one"});
    if (desc.isComplexType || desc.isEnum) {
        if (isEncoded && desc.isArray) {
            part.xmlTypeNs = desc.type.ns;
            part.xmlType = desc.type.name;
            part.isArray = true;
        }
        processType(wsdl, desc.type, desc, allModelTypes, otherTypes, false);
    }
}



function processType(wsdl, type, desc, allModelTypes, otherTypes, isEmbedded) {
    if (allModelTypes[desc.ctype]) {
        return;
    }

    var typeModel = {typeName: desc.ctype, isEmbedded : isEmbedded, type: desc.type};
    allModelTypes[desc.ctype] = typeModel;
    if (!desc.isEnum) {
        var props = [];
        typeModel.propertySet = props;
        processTypeContent(wsdl, allModelTypes, otherTypes, type, props);
    }
}

function processTypeContent(wsdl, allModelTypes, otherTypes, type, props) {
    if (type.baseTypeNs && type.baseTypeNs != SOAP_ENCODING_NS && type.baseTypeNs != XSD_NS) {
        var baseQName = makeQualifiedName(type.baseTypeNs, type.baseTypeName);
        var baseType = wsdl.types[baseQName] ;
        otherTypes[baseQName] = {typeName: baseQName, type: baseType};
        processTypeContent(wsdl, allModelTypes, otherTypes, baseType, props);
    }
    type.content.forEach(function(field) {
        var fdesc = {name: field.name};
        props.push(fdesc);

        if (field.maxOccurs > 1 || field.maxOccurs < 0) {
            fdesc.cardinality = "oneToMany";
        }
        fdesc.required = field.minOccurs != 0;
        var tdesc = getTypeDescFromName(wsdl, field.jsonType, field.isEnum, field.xmlTypeNs, field.xmlType);
        fdesc.type = tdesc.ctype;
        if (tdesc.isArray) {
            fdesc.cardinality = "oneToMany";
        }
        if (tdesc.isComplexType  || tdesc.isEnum)  {
            processType(wsdl, tdesc.type, tdesc, allModelTypes, true);
        }
    });
}

function createTypeDirectory(wsdl) {
    var directory = {};
    var key;
    for (var typeName in wsdl.types) {
        var type = wsdl.types[typeName];
        if (type.isSynthetic) {
            key = type.stem = type.name.slice(0, -7);
        }
        else {
            key = type.name;
        }

        if (directory[key]) {
            directory[key]++;
        }
        else {
            directory[key] = 1;
        }
    }
    return directory;
}

function createExternalSystem(model, wsdlSoapAddress, proxyConfig, name) {
    var params = { "name": name };
    var endpoint = null;
    if (proxyConfig && proxyConfig.soapAddress) {
        endpoint = proxyConfig.soapAddress;
    }
    else if (wsdlSoapAddress) {
        endpoint = (wsdlSoapAddress.isHttps ? "https" : "http") + "://" + wsdlSoapAddress.hostname +
            (wsdlSoapAddress.port ? ":" + wsdlSoapAddress.port : "") + wsdlSoapAddress.path;
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
            "scalarBaseType": enumType,
            "scalarInheritsFrom": enumType,
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
    model.push(
        {"op": "INVOKE",
            "targetType": "CdmType",
            "name": "replaceCdmType",
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

function readProjectJsonFile() {
    if (!fs.existsSync(common.projectFilename)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(common.projectFilename,'utf8'));
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

function makeQualifiedName(ns, name) {
    return ns ? '{' + ns + '}' + name : name;
}

function shouldIgnoreType(ns) {
    return !ns || ns == XSD_NS;
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
    return ctype ? ctype : "string";
}

function makeJsonType(jtype) {
    return {jsonType : jtype};
}

function getTypeDesc(type, typeDirectory) {
    var desc = {};
    if (type.jsonType && !type.enumeratedValues) {
        desc.ctype = getCdmType(type.jsonType);
    }
    else {
        desc.isComplexType = !type.jsonType;
        var simpleName;
        var uniqueName;
        if (type.isSynthetic) {
            simpleName = type.stem;
            uniqueName = type.name;
        }
        else {
            simpleName = type.name;
            uniqueName = type.name + "_" + type.nsChecksum;
        }
        desc.ctype = typeDirectory[simpleName] > 1 ? uniqueName : simpleName;
    }
    return desc;
}

function getTypeDescFromName(wsdl, jsonType, isEnum, ns, local) {
    var isArray;
    var type;
    if (jsonType && (!isEnum || jsonType != "string")) {
        type = makeJsonType(jsonType);
    }
    else {
        type = wsdl.types[makeQualifiedName(ns, local)];
        if (type.baseTypeName == "Array" && type.baseTypeNs == SOAP_ENCODING_NS) {
            isArray = true;
            var rowDesc = type.content[0];
            if (rowDesc.jsonType) {
                type = makeJsonType(rowDesc.jsonType);
            }
            else {
                type = wsdl.types[makeQualifiedName(rowDesc.xmlTypeNs, rowDesc.xmlType)];
            }
        }
    }

    var desc = getTypeDesc(type, wsdl.typeDirectory);
    desc.isArray = isArray;
    desc.type = type;
    desc.isEnum = isEnum;
    return desc;
}

function simplifyRequestParams(wsdl, opInput) {
    var canSimplify = false;
    var shouldSimplify = false;
    var names = {};
    var params = [];
    opInput.parts.forEach(function(part) {
        var desc;
        var name;
        if (part.elementName) {
            var elm = wsdl.elements[makeQualifiedName(part.elementNs, part.elementName)];
            name = part.elementName;
            desc = getTypeDescFromName(wsdl, elm.jsonType, elm.isEnum, elm.xmlTypeNs, elm.xmlType);
        }
        else {
            desc = getTypeDescFromName(wsdl, part.jsonType, part.isEnum, part.xmlTypeNs, part.xmlType);
            name = part.name;
        }
        var type = desc.type;
        if (type.jsonType) {
            if (names[name]) {
                return;
            }
            names[name] = true;
            params.push(part);
        }
        else {
            shouldSimplify = true;
            desc.type.content.forEach(function(row) {
                if (names[row.name]) {
                    return;
                }
                if (emutils.hasValue(row.maxOccurs) &&  row.maxOccurs != 1) {
                    return;
                }
                names[row.name] = true;
                var param =
                {
                    parentName : part.name,
                    name : row.name,
                    ns : row.ns,
                    xmlType : row.xmlType,
                    xmlTypeNs : row.xmlTypeNs,
                    jsonType : row.jsonType,
                    isAttr : row.isAttr
                };
                params.push(param);
            });
        }
    });

    if (!shouldSimplify) {
        return;
    }
    opInput.params = params;
}

function unwrapResponse(wsdl, opOutput) {
    if (!opOutput.parts || opOutput.parts.length != 1) {
        return;
    }
    var part = opOutput.parts[0];
    var desc;
    if (part.elementName) {
        var elm = wsdl.elements[makeQualifiedName(part.elementNs, part.elementName)];
        desc = getTypeDescFromName(wsdl, elm.jsonType, elm.isEnum, elm.xmlTypeNs, elm.xmlType);
    }
    else {
        desc = getTypeDescFromName(wsdl, part.jsonType, part.isEnum, part.xmlTypeNs, part.xmlType);
    }
    var type = desc.type;
    if (type.jsonType) {
        return;
    }
    var count = 0;
    var field;
    while (type.content.length == 1 && type.content[0].maxOccurs != -1) {
        count++;
        field = type.content[0];
        if (type.jsonType) {
            break;
        }
        desc = getTypeDescFromName(wsdl, field.jsonType, field.isEnum, field.xmlTypeNs, field.xmlType);
        type = desc.type;
    }
    if (count > 0) {
        opOutput.skipLevels = count;
        part.ns = field.ns;
        part.name = field.name;
        part.jsonType = field.jsonType;
        part.isEnum = field.isEnum;
        part.xmlTypeNs = field.xmlTypeNs;
        part.xmlType = field.xmlType;
        delete part.elementName;
        delete part.elementNs;
    }
}
