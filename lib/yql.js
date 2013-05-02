"use strict";

var fs = require("fs");
var util = require("util");
var mmscmd = require("./mmscmd");
var common = require("./common");
var create = require("./create");
var path = require('path');
var emutils = require('emutils');
var emote = require('./emote');
var emsoap = require("emsoap");

var descFile = "yql.desc.json";
var valuesFile = "yql.values.json";
var dataFile = "yql.data.json";

exports.addCommands = addCommands;

var yqlUrl = "http://query.yahooapis.com/v1/public/streaming/yql";

function addCommands(commandMap) {
    commandMap.describeYqlType = function() {
        var command = emote.getCommand();
        describeYqlType(command[1], command[2], emote.finished);
    };
    commandMap.getDataForYqlType = function() {
        var command = emote.getCommand();
        getDataForYqlType(command[1], emote.finished);
    };
}

function describeYqlType(subProject, type, cb) {
    common.gotoProjectHome();
    var dir = "model" + path.sep + subProject + path.sep;
    common.insurePathExists(dir);
    process.chdir(dir);
    if (fs.existsSync(descFile)) {
        fs.unlinkSync(descFile);
    }
    if (fs.existsSync(valuesFile)) {
        fs.unlinkSync(valuesFile);
    }
    if (fs.existsSync(dataFile)) {
        fs.unlinkSync(dataFile);
    }
    getQueryValues(type, function(err, values) {
        if (err) {
            return cb(err);
        }
        if (!values) {
            return cb();
        }
    })
}

function getDataForYqlType(subProject, cb) {
    common.gotoProjectHome();
    var dir = "model" + path.sep + subProject + path.sep;
    var descs;
    var values;
    try {
        process.chdir(dir);
        if (fs.existsSync(dataFile)) {
            fs.unlinkSync(dataFile);
        }
        descs = readJsonFile(descFile);
        values = readJsonFile(valuesFile);
    }
    catch (ex){
        cb("The model files for the subproject '" + subProject + "' have become corrupted.  Use the getYql command to recreate them.")
        return;
    }
    if (!descs) {
        cb("The model files for the subproject '" + subProject + "' do not exist.  Use the getYql command to create them.")
        return;
    }
    var type = descs.query.results.table.name;
    var whereClause = "";
    if (values) {
        whereClause = " where ";
        var first = true;
        values.forEach(function(row) {
            var quote =  (emutils.type(row.value) == "string") ? '"' : "";
            if (!first) {
                whereClause != " and ";
            }
            whereClause += row.name + "=" + quote + row.value + quote;
            first = false;
        });
    }
    var query = yqlUrl + formatQueryString({q : "select * from " + type + whereClause});
    console.log(query);
    var httpRequest = emsoap.subsystems.httpRequest;
    httpRequest.httpRequest(httpRequest.parseUrl(query), null, function(err, retval) {
        if (err) {
            console.log("Error fetching data from datatype " + type);
            return cb(err);
        }
        else if (httpRequest.isErrorStatus(retval.status)) {
            console.log("HTTP error " + retval.status + " fetching data from datatype " + type);
            return cb(retval);
        }
        console.log(util.inspect(JSON.parse(retval.body), false, null));
    });
}

function getQueryValues(type, cb) {
    var query = yqlUrl + formatQueryString({q : "desc " + type});
    var httpRequest = emsoap.subsystems.httpRequest;
    httpRequest.httpRequest(httpRequest.parseUrl(query), null, function(err, retval) {
        if (err) {
            console.log("Error describing datatype " + type);
            return cb(err);
        }
        else if (httpRequest.isErrorStatus(retval.status)) {
            console.log("HTTP error " + retval.status + " describing datatype " + type);
            return cb(retval);
        }
        var desc;
        try {
            desc = JSON.parse(retval.body);
            if (desc.error) {
                return cb(new Error(desc.error.description));
            }
            fs.writeFileSync(descFile, JSON.stringify(desc, null, 2));
            var select = desc.query.results.table.request.select;
            var requiredKeys=[];
            if (select.key) {
                select.key.forEach(function(key) {
                    if (key.required) {
                        requiredKeys.push(key);
                    }
                })
            }
            if (requiredKeys.length == 0) {
                cb(null, {});
            }
            else {
                var keyValues = [];
                requiredKeys.forEach(function(key) {
                    var row = {name : key.name};
                    switch (key.type) {
                        case 'xs:string' :
                            row.value="";
                            break;

                        case 'xs:boolean' :
                            row.value=false;
                            break;

                        case 'xs:long' :
                        case 'xs:int' :
                        case 'xs:short' :
                        case 'xs:byte' :
                            row.value=0;
                            break;


                        case 'xs:float' :
                        case 'xs:double' :
                            row.value=0.0;
                            break;

                        default :
                            row.value= null;
                    }
                    keyValues.push(row);
                })
                fs.writeFileSync(valuesFile, JSON.stringify(keyValues, null, 2));
                console.log("Please edit the file " + path.resolve(valuesFile) +
                             " to provide values for the required keys before running 'emote getDataForYql'.");
            }

        }
        catch (err) {
            console.log("Error parsing description of datatype " + type);
            cb(err);
        }
    });

}

function formatQueryString(queries, omitStandard) {
    if (!omitStandard) {
        queries = emutils.clone(queries);
        queries.format = "json";
        queries.jsonCompat = "new";
    }
    var qs = "";
    for (var name in queries) {
        var value = queries[name];
        qs += qs ? "&" : "?";
        qs += name;
        qs += '='
        qs += value;
    };
    return qs;
}

function readJsonFile(fn) {
    if (!fs.existsSync(fn)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(fn));
}
