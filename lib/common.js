"use strict";
var fs = require('fs');

var projectFilename = 'project.json';

exports.gotoProjectHome = function gotoProjectHome(optional) {
    var cwd = process.cwd(); 
    var lastDir = null;
    while(!fs.existsSync(projectFilename) && (process.cwd() != lastDir)) {
        lastDir = process.cwd();
        // console.log('Looking in ' + process.cwd());
        try {
            process.chdir('..');
        } catch(err) {
            if(optional) {
                process.chdir(cwd);
                return null;
            } else {
                console.log('Not currently in a project (no ' + projectFilename + ' found.) ' + err);
                process.exit(1);
            }
        }
    }
    if(process.cwd() == lastDir) {
        process.chdir(cwd);
        return null;
    }
    var config;
    try {
        config = JSON.parse(fs.readFileSync(projectFilename,'utf8'));
    } catch(err) {
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