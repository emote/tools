"use strict";
var fs = require('fs');
var async = require('async');

var projectFilename = 'project.json';
exports.projectFilename = projectFilename;

exports.forEachDir = function forEachDir(f,cb) {
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

exports.gotoProjectHome = function gotoProjectHome(optional) {
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

    var config;
    try {
        config = JSON.parse(fs.readFileSync(projectFilename,'utf8'));
    } catch(err) {
        if(optional) {
            console.log('Ignoring ' + projectFilename + ' with invalid content.');
            process.chdir(cwd);
            return null;
        }
        console.log('Error with project ' + projectFilename + ' : ' + err);
        process.exit(1);
    }
    return config;
}

exports.getJSON = function getJSON(path) {
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


exports.getSorted = function getSorted(object) {
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