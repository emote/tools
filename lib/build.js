"use strict";
var async = require('async');
var fs = require('fs');
var npm = require('npm');
var path = require('path');
var common = require('./common');
var pjson = require('../package.json');

// builders specifies the function to be executed (by common.command) for each type
// Note that if we add extra logic to the build phase (like code generation)
// it will go in one of the functions below.
exports.builders = {

    proxy : function(dirname,cb) {
        var installPath = path.join(process.cwd(),dirname);
        common.pushdProjectHome(function(callback) {
            npmInstallProxy(dirname,installPath,callback);
        },function() {
            if(!common.global.silentBuild) {
                console.log('Built proxy ' + dirname + ' into staging');
            }
            cb();
        });
    },

    app : function(dirname,cb) {
        cb(); // do nothing during build phase
    },

    operation : function(dirname,cb) {
        cb(); // do nothing during build phase
    },

    model : function(dirname,cb) {
        cb(); // do nothing during build phase
    },

    theme : function(dirname,cb) {
        cb(); // do nothing during build phase
    },

    resource : function(dirname,cb) {
        cb(); // do nothing during build phase
    }


};

function npmInstallProxy(proxyName,installPath,callback) {
    if (!fs.existsSync('staging')) fs.mkdirSync('staging');
    process.chdir('staging');
    if (!fs.existsSync('proxy')) fs.mkdirSync('proxy');
    process.chdir('proxy');
    if (!fs.existsSync(proxyName)) fs.mkdirSync(proxyName);
    process.chdir(proxyName);

    var digest = common.hashDirectoryContents(installPath);
    if (fs.existsSync('digest.txt')) {
        var existingDigest = fs.readFileSync('digest.txt','utf-8');
        if(existingDigest === digest) {
            if(!common.global.silentBuild) {
                console.log('Proxy code for ' + proxyName + ' has not changed since last build.');
            }
            return callback();
        }
    }

    if (!fs.existsSync("node_modules")) fs.mkdirSync("node_modules");

    // Note: using npm from code is a little tricky and was not well documented when
    // this was implemented. This follows the most basic workable pattern I could find.
    npm.load({},function(err,npmobj) {
        if(err) common.exit('Error loading npm: ' + err);

        var packageJSON = common.getJSON(path.join(installPath,"package.json"));
        if(!packageJSON) {
            common.exit('Error, did not find expected package.json in ' + installPath);
        }

        var name = packageJSON.name;
        if(!name) common.exit('name missing from package.json in proxy ' + installPath);

        npmobj.install(installPath,function(err) {
            if(err) common.exit("Error in NPM install of " + installPath);
            fs.writeFileSync('digest.txt',digest);

            npm.localPrefix = null;
            // This works around an NPM bug where the install directory is 'sticky' within npm
            // and does not change when npm install is run again from a different directory

            callback();
        });
    });
}


