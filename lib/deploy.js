"use strict";
var async = require('async');
var fs = require('fs');
var mmscmd = require('./mmscmd');
var zipper = require('./zipper');
var sfsetup = require('./sfsetup');
var virtualop = require('./virtualop');
var theme = require('./theme');
var common = require('./common');
var path = require('path');

var session;

var ignoreFiles = {
    "test":true,
    "tests":true,
    "example":true,
    "examples":true,
    "README.markdown":true,
    "README.md":true,
    "LICENSE":true,
    "AUTHORS":true,
    "Cakefile":true
};

exports.global = {};

function zipToBuffer(dirName) {
    if(!fs.existsSync(dirName))
    {
        console.log('Cannot find app directory ' + dirName);
        process.exit(1);
    }
    var stats = fs.statSync(dirName);
    if(!stats.isDirectory()) {
        console.log(dirName + ' not a directory!');
        process.exit(1);
    }
    console.log('Zipping up directory: ' + dirName);
    var zip = new zipper.ZipFile();
    process.chdir(dirName);
    zip.addDir('.',ignoreFiles);
    process.chdir('..');
    return zip.createZip();
}

function uploadResourceToMMS(proxyName,data,callback) {
    console.log('Uploading resource: ' + proxyName + ' of length ' + data.length);
    var parts = {
        resourceName: '/integrationPackage/' + proxyName,
        contentType: 'application/zip',
        myFile: {filename: proxyName, contents: data}
    };
    session.console("resource",parts,callback,true); // last param is useResourceController
}

function uploadAppToMMS(filename,params,data,callback) {
    console.log('Uploading app: ' + filename + ' of length ' + data.length);
    var parts = {
        scripted: "true",
        override: "true",
        packageFile: {filename: filename, contents: data}
    };

    //
    //  If this app has an externalSystemName it is a credentials app and
    //  we must add the externalSystemName parameter to 'parts'
    //
    if(params) {
        parts.externalSystemName = params.externalSystemName;
        console.log('Including externalSystemName ' + parts.externalSystemName + ' for uploaded app ' + filename);
    }

    session.console("saveMiniApp",parts,callback);
}

var deployers = {
    proxy : function(dirname,cb) {
        uploadResourceToMMS(dirname,zipToBuffer(dirname),cb);
    },

    app : function(dirname,cb) {
        var params = common.getJSON(path.join(dirname,'app.json'));
        uploadAppToMMS(dirname,params,zipToBuffer(dirname),cb);
    },

    operation : function(dirname,cb) {
        process.chdir(dirname);
        if(fs.existsSync('operation.json')) {
            virtualop.deployVirtualOp(session,function(err) {
                process.chdir('..');
                console.log('Completed deployment of operation in ' + dirname);
                cb(err);
            });
        } else {
            console.log("Could not find operation.json in " + dirname);
            process.exit(1);
        }
    },

    model : function(dirname,cb) {
        process.chdir(dirname);
        if(fs.existsSync('model.json')) {
            //console.log('Starting deployment of model.json in ' + dirname);
            mmscmd.execFile('model.json',session,null,function(err) {
                process.chdir('..');
                console.log('Completed deployment of model ' + dirname);
                cb(err);
            });
        } else if(fs.existsSync('salesforce.json')) {
            sfsetup.deployModel(dirname,session,function(err) {
                process.chdir('..');
                console.log('Completed deployment of Salesforce model.');
                cb(err);
            });
        } else {
            console.log("Could not find a valid model file in " + dirname);
            process.exit(1);
        }
    },

    theme : function(dirname,cb) {
        // steve call code in theme.js
        theme.update(session,dirname,cb,exports.global.argv.deleteTheme,exports.global.argv.markThemePublic);
    }

};

function deployAll(dirname,cb) {
    //console.log('deployAll '+dirname);
    if(fs.existsSync(dirname)) {
        process.chdir(dirname);
        //console.log('Starting deployment of '+dirname+'s.');
        common.forEachDir(deployers[dirname],function(err) {
            process.chdir('..');
            console.log('Completed deployment of '+dirname+'s.');
            cb(err);
        });
    } else {
        cb();
    }    
}

exports.command = function deploy(type, name, mmsSession, cb) {
    session = mmsSession; // Only one mms session for emote, so this works
    var config = common.gotoProjectHome();
    if(!type && !name) {
        console.log('Deploying project: ' + config.name);
        async.forEachSeries(['model','proxy','app','operation','theme'],deployAll,function(err) {
            if(err) {
                console.log('Error during deployment of project: ' + err);
                process.exit(1);
            } else {
                console.log('Completed deployment of project.');
            }
            cb();
        });
    } else if(name) {
        console.log('Deploying ' + type + ': ' + name);
        process.chdir(type);
        deployers[type](name,cb);
    } else {
        if(type && !fs.existsSync(type)) {
            console.log('There is no subdirectory ' + type + ' in this project.');
            process.exit(1);
        }
        deployAll(type,cb);
    }
}

exports.undeploy = function undeploy(type, name, mmsSession, cb) {
    if(type!="theme") {
        console.log("undeploy not implemented for type " + type);
        process.exit(1);
    }
    if(!name) {
        name = "default";
    }
    var config = common.gotoProjectHome();
    process.chdir(type);
    theme.update(mmsSession,name,cb,true,false);
}
