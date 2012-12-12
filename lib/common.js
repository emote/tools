"use strict";
var fs = require('fs');
var async = require('async');
var path = require('path');
var pjson = require('../package.json');

var projectFilename = 'project.json';
exports.projectFilename = projectFilename;

exports.global = {};

var verbose;

exports.setVerbose = function(val) {
    verbose = val;
}

exports.verbose = function(str) {
    if(verbose) {
        console.log('VERBOSE: ' + str);
    }
}

exports.forEachDir = forEachDir;
function forEachDir(f,cb) {
    var files = fs.readdirSync('.');
    var dirs = [];
    files.forEach(function(name) {
        if(name.charAt(0)!='.') {
            var stats = fs.statSync(name);
            if(stats.isDirectory()) {
                dirs.push(name);
            }
        }
    });
    async.forEachSeries(dirs,f,cb);               
}

exports.gotoProjectHome = gotoProjectHome;
function gotoProjectHome(optional) {
    if(global.projectHome) {
        process.chdir(global.projectHome);
        return global.projectConfig;
    }

    var cwd = process.cwd();
    var notFound;
    while(!fs.existsSync(projectFilename)) {
        var lastDir = process.cwd();
        // console.log('Looking in ' + process.cwd());
        try {
            process.chdir('..');
            if (lastDir == process.cwd()) {
                notFound = true;
                var err = "";
                break;
            }
        } catch(err) {
            notFound = true;
        }
    }

    global.projectHome = process.cwd(); 

    if (notFound) {
        if(optional) {
            process.chdir(cwd);
            return null;
        } else {
            console.log('Not currently in a project (no ' + projectFilename + ' found.) ' + err);
            process.exit(1);
        }
    }

    var config;
    try {
        config = JSON.parse(fs.readFileSync(projectFilename,'utf8'));
    } catch(err) {
        if(optional) {
            console.log('Ignoring ' + path.join(process.cwd(),projectFilename) + ' with invalid content.');
            process.chdir(cwd);
            return null;
        }
        console.log('Error with project ' + projectFilename + ' : ' + err);
        process.exit(1);
    }

    var toolsMajorVersion = pjson.version.split('.')[0];
    var projectVersion = config.toolsVersion;
    if(!projectVersion || projectVersion.split('.')[0] < toolsMajorVersion) {
        if(projectVersion) console.log('toolsVersion for project is ' + projectVersion);
        console.log('This version of emote requires that the project be upgraded.');
    }

    global.projectConfig = config;

    return config;
}

exports.getJSON = getJSON;
function getJSON(path) {
    //console.log('Reading JSON from ' + path);
    if(fs.existsSync(path)) {
        try {
            var params = JSON.parse(fs.readFileSync(path,'utf-8'));
            //console.log('Read JSON from ' + path);
            //console.dir(params);
            return params;
        } catch(err) {
            console.log('Error reading JSON from ' + path + ': ' + err);
            process.exit(1);
        }
    } else {
        return null;
    }
}


exports.getSorted = getSorted;
function getSorted(object) {
    var names = [];
    for (var name in object) {
        names.push(name);
    }

    var sorted = {};
    names.sort().forEach(function(name) {
        sorted[name] = object[name];
    });

    return sorted;
}

exports.exit = exit;
function exit(msg) {
    if(msg) console.log(msg);
    console.log('exiting emote.');
    process.exit(1);
}

exports.insurePathExists = insurePathExists; 
function insurePathExists(filename) {
    var retval = true;
    var pathArr = filename.split(path.sep)
    var simpleName = pathArr.pop();
    var currentPath = ".";
    pathArr.forEach(function(dirName) {
        if(dirName) { // list starts with null dirName for an absolute path
            currentPath = path.join(currentPath,dirName);
            if(fs.existsSync(currentPath)) {
                if(!fs.statSync(currentPath).isDirectory()) {
                    console.log("File" + currentPath + " exists. Cannot create directory.");
                    retval = false;
                }
            } else {
                fs.mkdirSync(currentPath);
            }
        }
    });
    return retval; 
}

exports.findFiles = findFiles;
function findFiles(dirName) {
    var files = [];
    addDir(dirName,files);
    return files;
}

function addDir(dirName,files) {
    var ls = fs.readdirSync(dirName);
    for(var i=0; i<ls.length; i++) {
        var fn = ls[i];
        if(fn.charAt(0) != '.') { // ignore hidden files
            var qn;
            if(dirName === '.') {
                qn = fn;
            } else {
                qn = dirName + '/' + fn;
            }

            var stats = fs.statSync(qn);
            if(stats.isDirectory()) {
                addDir(qn,files);
            } else {
                files.push(qn);
            }
        }
    }
}

exports.command = command;
function command(commandMap, typeOrder, type, name, cb) {
    var config = gotoProjectHome();

    if(type && name) {
        // most specific, command applies to one object (a specific proxy, app, etc.)

        if(!fs.existsSync(type)) {
            exit('There is no subdirectory ' + type + ' in this project.');
        }

        process.chdir(type);
        commandMap[type](name,cb);

    } else if(type && !name) {
        // command applies to a given type (all proxies, or all apps, etc.)

        if(!fs.existsSync(type)) {
            exit('There is no subdirectory ' + type + ' in this project.');
        }

        iterateOverDir(type,cb);

    } else if(!type && !name) {
        // command applies to all objects in project, 
        // perform command for each type in order

        async.forEachSeries(typeOrder,iterateOverDir,function(err) {
            if(err) return exit('Error excuting command: ' + err);
            cb();
        });

    } else {
        exit('Emote internal error, cannot iterate command.');
    }

    function iterateOverDir(dirname,cb) {
        if(fs.existsSync(dirname)) {
            process.chdir(dirname);
            forEachDir(commandMap[dirname],function(err) {
                process.chdir('..');
                cb(err);
            });
        } else {
            cb();
        }    
    }
}

exports.pushdProjectHome = pushdProjectHome;
function pushdProjectHome(task,callback) {
    var cwd = process.cwd();
    process.chdir(global.projectHome);
    task(function() {
        process.chdir(cwd);
        callback();
    });
}

/*
exports.getOneSubDir = function 
    var ls = fs.readdirSync('.');
    ls.forEach(function(name) {

        var end = name.substring(name.length - 3);
        if(end === '.js') {
            if(functionBody) {
                console.log('More than one .js file in operation is not allowed: ' + opInfo.name);
                process.exit(1);
            } else {
                filename = name;
                functionBody = fs.readFileSync(name, "utf-8");  
            }
        }
    });
*/