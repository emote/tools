"use strict";
var common = require('./common');
var fs = require('fs');
var path = require('path');
var util = require('util');

function runtest(name,cb) {
    var absPath = path.resolve(path.join('.',name));
    console.log('Loading test: ' + absPath);
    var main = require(absPath);
    main(common.global.session,function(err) {
        if(err){
            console.log('Test ' + name + ' FAILED with error: \n' + util.inspect(err,false,null));
        } else {
            console.log('Test ' + name + ' PASSED');
        }
    });    
}

exports.command = function command(name, cb) {
    var config = common.gotoProjectHome();
    process.chdir('test');

    console.log("Starting test in " + process.cwd());
    console.dir(fs.readdirSync('.'));

    if(name) {       
        runtest(name,cb);
    } else {
        common.forEachDir(runtest,cb);
    }
}
