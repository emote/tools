"use strict";
var fs = require('fs');
var crypto = require('crypto');
var async = require('async');
var path = require('path');
var pjson = require('../package.json');
var prompt = require('prompt');
var emutils = require('emutils');

var projectFilename = 'project.json';
exports.projectFilename = projectFilename;

exports.global = {};

var verbose;

exports.setVerbose = function(val) {
    verbose = val;
}

exports.isVerbose = function() {
    return verbose;
}
exports.verbose = function(str) {
    if(verbose) {
        console.log('VERBOSE: ' + str);
    }
}

exports.EMOTE_PROFILE = process.env.HOME + "/.emote_profile";
exports.PROJECT_PROFILE = "profile.json";
exports.DEFAULT_SERVER = "https://dev.emotive.com";

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
    if(exports.global.projectHome) {
        process.chdir(exports.global.projectHome);
        return exports.global.projectConfig;
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

    if (notFound) {
        if(optional) {
            process.chdir(cwd);
            return null;
        } else {
            console.log('Not currently in a project (no ' + projectFilename + ' found.) ' + err);
            process.exit(1);
        }
    }

    exports.global.projectHome = process.cwd();

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

    exports.global.projectConfig = config;

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
    console.log('Exiting emote.');
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

// This implements the basic pattern of 'emote command {type} {name}'
// where type is optional, e.g. app | proxy | model
// and name is the optional module name
exports.command = command;
function command(commandMap, typeOrder, type, name, cb) {
    var config = gotoProjectHome();

    //
    //  Themes do not have the normal behavior of doing something for all the subdirectories;
    //  if nothing is specified assume we *only* do the "default" theme directory.
    //
    if ((type == "theme") && !name)
    {
        name = "default";
    }

    if(type && name) {
        // most specific, command applies to one object (a specific proxy, app, etc.)

        if(!fs.existsSync(type)) {
            exit('There is no subdirectory ' + type + ' in this project.');
        }

        process.chdir(type);
        if(typeof commandMap[type] === 'function') {
            commandMap[type](name,cb);
        } else {
            cb();
        }

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
            if(typeof commandMap[dirname] === 'function') {
                forEachDir(commandMap[dirname],function(err) {
                    process.chdir('..');
                    cb(err);
                });
            } else {
                cb();
            }
        } else {
            cb();
        }
    }
}

exports.pushdProjectHome = pushdProjectHome;
function pushdProjectHome(task,callback) {
    var cwd = process.cwd();
    process.chdir(exports.global.projectHome);
    task(function() {
        process.chdir(cwd);
        callback();
    });
}

// Array of strings to map of keys with value true
exports.addToMap = addToMap;
function addToMap(map,arr) {
    for(var i=0;i<arr.length;i++) {
        map[arr[i]] = true;
    }
    return map;
}

// See the "prompt" package to understand the code below for command line input
exports.getUserInputForCredentials = getUserInputForCredentials;
function getUserInputForCredentials(creds,cb /*function(creds)*/) {

    var inputSchema = {properties:{}};
    var needsInput = false;

    // For each credential with a value in << >>, build the data
    // structure needed by the 'prompt' package
    for(var prop in creds) {
        var value = creds[prop];
        if(emutils.type(value) === 'string') {
            if(value.indexOf('<<') === 0) {
                // << means a string where user input will be substituted >>
                var offset = value.indexOf('>>');
                if(offset === -1) continue;

                needsInput = true;

                var defaultValue = value.substring(offset + 2);
                var promptText = value.substring(2,offset);

                inputSchema.properties[prop] = {
                    description: promptText + '?', // Prompt displayed to the user. If not supplied name will be used.
                    type: 'string',      // Specify the type of input to expect.
                    hidden: (prop.toLowerCase().indexOf('password') != -1 ? true : false),  // If true, characters entered will not be output to console.
                    default: defaultValue // Default value to use if no value is entered.
                }
            }
        }
    }

    if(!needsInput) return cb(creds);

    prompt.start();
    prompt.colors = false;
    prompt.message = '';
    prompt.delimiter = '';
    prompt.get(inputSchema, function (err, result) {
        // console.log('Command-line input received:');
        // console.dir(result);

        for(var prop in result) {
            creds[prop] = result[prop];
        }
        cb(creds);
    });
}

exports.hashDirectoryContents = hashDirectoryContents;
function hashDirectoryContents(directory) {
    var hash = crypto.createHash('sha1');
    hashTheDirectoryContents(hash, directory, ".");
    return hash.digest("hex");

    function hashTheDirectoryContents(hash, dir, relativeDirName) {
        var contents = fs.readdirSync(dir);
        contents.sort();
        contents.forEach(function(filename) {
            var fullName = dir + path.sep + filename;
            var relativeName = relativeDirName + path.sep + filename;
            //console.log("adding " + fullName + " (" + relativeName + ")") ;
            hash.update(relativeName, "utf8");
            var stats = fs.statSync(fullName);
            if (stats.isDirectory()) {
                hashTheDirectoryContents(hash, fullName, relativeName);
            }
            else {
                hash.update(fs.readFileSync(fullName));
            }
        });
    }
}

exports.objToArr = objToArr;
function objToArr(obj) {
    var retval = [];
    for(var name in obj) {
        retval.push(name);
    }
    return retval;
}

exports.ISODateString = ISODateString;
function ISODateString(d) {
    return d.getUTCFullYear()+'-'
    + pad(d.getUTCMonth()+1)+'-'
    + pad(d.getUTCDate())+'T'
    + pad(d.getUTCHours())+':'
    + pad(d.getUTCMinutes())+':'
    + pad(d.getUTCSeconds())+'Z';
    function pad(n){
        return n<10 ? '0'+n : n
    }
}

exports.convertWildcardsToRegex = convertWildcardsToRegex;
function convertWildcardsToRegex(expr) {
    if(!expr) return ".*";
    var arr = expr.split("*");
    var regex = arr.join(".*");
    return regex;
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
