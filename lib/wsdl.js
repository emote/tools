"use strict";

var fs = require("fs");
var mmscmd = require("./mmscmd");
var common = require("./common");

var wsdlJsonFile = "wsdl.json";
var opsJsonFile = "wsdlOps.json";
var modelFile = "model.json";

var XSD_NS = "http://www.w3.org/2001/XMLSchema";
var SOAP_ENCODING_NS = 'http://schemas.xmlsoap.org/soap/encoding/';

exports.getWsdl = getWsdl;
exports.generate = generate;

function getWsdl(session, subProject, url, service, port, username, password, cb) {
    common.gotoProjectHome();
    var dir = "model/" + subProject + "/";
    mkdirs(dir);
    process.chdir(dir);
    if (fs.existsSync(wsdlJsonFile)) {
        fs.unlinkSync(wsdlJsonFile);
    }
    if (fs.existsSync(opsJsonFile)) {
        fs.unlinkSync(opsJsonFile);
    }
    session.login(function() {
        mmscmd.getWsdl(session, url, service, port, username, password, function(err, result) {
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
                    var strm = fs.createWriteStream(wsdlJsonFile);
                    strm.write(JSON.stringify(wsdl, null, 2));
                    strm.end();
                    var ops = {operations:{}};
                    for (var name in wsdl.operations) {
                        ops.operations[name] = false;
                    }
                    strm = fs.createWriteStream(opsJsonFile);
                    strm.write(JSON.stringify(ops, null, 2));
                    strm.end();
                }
            }
            cb(err);
        });
    });
}

function generate(subProject, cb) {
    common.gotoProjectHome();
    createModel(subProject, cb);
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
    }
    if (!wsdl) {
        cb("The model files for the subproject" + subProject + " do not exist.  Use the getWsdl command to create them.")
        return;
    }

    var svcName = subProject;
    var svcTypeName = svcName + "_ServiceType";

    var model = [];
    createType(model, svcTypeName, [], false, svcTypeName);
    bindType(model, svcTypeName, svcName);

    var allTypes = {};
    var numOps = 0;
    for (var opName in ops.operations) {
        if (ops.operations[opName]) {
            numOps++;
            var allParams = [];
            var op = wsdl.operations[opName];
            var inputParts =  [];
            var outputParts = [];
            if (op.input) {
                op.input.parts.forEach(function(part) {
                    processPart(wsdl, part, inputParts, allTypes);
                });
            }
            if (op.output) {
                op.output.parts.forEach(function(part) {
                    processPart(wsdl, part, outputParts, allTypes);
                });
            }
            var rtnType;
            if (outputParts.length > 0) {
                rtnType = outputParts[0].type;
            }
            addOperation(model, svcTypeName, op.name, svcName, rtnType, inputParts);
        }
    }
    if (numOps == 0) {
        cb("No operations were enabled.  Please edit the " + opsJsonFile + " file.")
    }

    createExternalSystem(model, svcName);

    for (var tname in allTypes) {
        var type = allTypes[tname];
        createType(model, type.typeName, type.propertySet, type.isEmbedded, svcTypeName);
        bindType(model, type.typeName, svcName);
    }

    if (fs.existsSync(modelFile)) {
        fs.unlinkSync(modelFile);
    }
    var strm = fs.createWriteStream(modelFile);
    strm.write(JSON.stringify(model, null, 2));
    strm.end();
    cb();
}

function processPart(wsdl, part, allParts, allTypes) {
    var type;

    var desc
    if (part.elementName) {
        var elm = wsdl.elements[makeQualifiedName(part.elementNs, part.elementName)];
        if (elm.jsonType) {
            desc = getTypeDescFromName(wsdl, elm.jsonType);
        }
        else {
            desc = getTypeDescFromName(wsdl, null, elm.xmlTypeNs, elm.xmlType);
        }
    }
    else {
        if (part.jsonType) {
            desc = getTypeDescFromName(wsdl, part.jsonType);
        }
        else {
            desc = getTypeDescFromName(wsdl, null, part.xmlTypeNs, part.xmlType);
        }
    }
    allParts.push({name : part.name, typeName: desc.ctype, targetType : "CdmParameter", cardinality : desc.isArray ? "many" : "one"});
    if (desc.isComplexType) {
        processType(wsdl, desc.type, desc, allTypes, false);
    }
}



function processType(wsdl, type, desc, allTypes, isEmbedded) {
    if (allTypes[desc.ctype]) {
        return;
    }

    var typeModel = {typeName: desc.ctype, isEmbedded : isEmbedded};
    var props = [];
    typeModel.propertySet = props;
    allTypes[desc.ctype] = typeModel;

    type.content.forEach(function(field) {
        var fdesc = {name: field.name};
        props.push(fdesc);

        if (field.maxOccurs > 1 || field.maxOccurs < 0) {
            fdesc.cardinality = "oneToMany";
        }
        var tdesc = getTypeDescFromName(wsdl, field.jsonType, field.xmlTypeNs, field.xmlType);
        fdesc.type = tdesc.ctype;
        if (tdesc.isArray) {
            fdesc.cardinality = "oneToMany";
        }
        if (tdesc.isComplexType)  {
            processType(wsdl, tdesc.type, tdesc, allTypes, true);
        }
    });
}

function createExternalSystem(model, name) {
    model.push(
        {
            "op": "INVOKE",
            "targetType": "CdmExternalSystem",
            "name": "createExternalSystem",
            "params": {
                "name": name
            }
        }
    )
}

function createType(model, name, props, isEmbedded, svcType) {
    model.push(
        {"op": "INVOKE",
        "targetType": "CdmType",
        "name": "replaceCdmType",
        "params": {
            "typeName": name,
            "storage": (isEmbedded ? "embedded" : "virtual"),
            "baseTable": (isEmbedded ? svcType : undefined),
            "extensionAllowed": true,
            "externallySourced": true,
            "propertySet": props
        }
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

function makeQualifiedName(ns, name) {
    return ns ? '{' + ns + '}' + name : name;
}

function parseQualifiedName(qn) {
    var nm = {};
    var brack = qn.indexOf('}');
    if (brack >= 0) {
        nm.name = qn.substring(1, brack);
        nm.ns = qn.substring(brack+1);
    }
    else {
        nm.name = qn;
    }

    return nm;
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

function getTypeDesc(type) {
    var desc = {};
    if (type.jsonType) {
        desc.ctype = getCdmType(type.jsonType);
    }
    else {
        desc.isComplexType = true;
        desc.ctype = type.isSynthetic ? type.name : type.name + "_" + type.nsChecksum;
    }
    return desc;
}

function getTypeDescFromName(wsdl, jsonType, ns, local) {
    var isArray;
    var type;
    if (jsonType) {
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
    var desc = getTypeDesc(type);
    desc.isArray = isArray;
    desc.type = type;
    return desc;
}

function mkdirs(dir) {
    if (!dir) {
        return;
    }
    if (dir.slice(-1) !== '/') {
        dir += '/';
    }
    var slash = 0;
    while (true) {
        var slash = dir.indexOf('/', slash);
        if (slash < 0) {
            return;
        }
        var d = dir.substring(0, slash);
        if (!fs.existsSync(d)) {
            fs.mkdirSync(d);
        }
        slash++;
    }
}