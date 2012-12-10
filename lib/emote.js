"use strict";
/*jshint node:true globalstrict:true laxcomma:true smarttabs:true undef:true */

var async = require('async');
var child_process = require('child_process');
var fs = require('fs');
var util = require('util');
var optimist = require('optimist');
var path = require('path');
var os = require('os');

var pjson = require('../package.json');

var common = require('./common');
var create = require('./create');
var download = require('./download');
var deploy = require('./deploy');
var help = require('./help');
var logview = require('./logview');
var mms = require('./mms');
var mmscmd = require('./mmscmd');
var wsdl = require("./wsdl");
var runtest = require('./runtest');
var build = require('./build')

var EMOTE_PROFILE = process.env.HOME + "/.emote_profile";
var PROJECT_PROFILE = "profile.json";
var DEFAULT_SERVER = "http://mms.emotive.com";

var command;
var packageRoot = "http://download.emotive.com/toolkit/";
var modelInit;
var mmsCreds;

// This is the order in which directories of the project
// are processed for most commands
var typeOrder = ['model','proxy','app','operation','theme'];

// Note that some commands require MMS session login
// MMS login is done in functions that are part of commandMap
// TODO: should not retry on failed login, should just exit
var commandMap = {
    add: function() { 
        create.add(command[2],command[3],null,modelInit,command[1],finished);
    },
    build: function() {
        common.command(build.builders,typeOrder,command[1],command[2],finished);
    },
    create: function() {
        var template = common.global.argv.template;
        if(template) {
            common.exit('The create command does not support the --template option.');
        } 
        create.newProject(command[1],modelInit,template,finished); 
    },
    deploy: function() {
        mmsLogin(function() {
            common.command(deploy.deployers,typeOrder,command[1],command[2],finished);
        }); 
    },
    download: function() { 
        mmsLogin(function() {
            download.getResourceAndWriteFiles(command[1],command[2],finished); 
        }); 
    },
    exec: function() { 
        mmsLogin(function() {
            mmscmd.execFile(command[1],common.global.session,outputWriter,finished); 
        }); 
    },
    generateFromWsdl : function() {
        wsdl.generate(command[1], finished)
    },
    getWsdl: function() {
        mmsLogin(function() {
            wsdl.getWsdl(session, command[1], command[2], command[3], command[4], command[5], command[6], finished);
        })
    },
    help: function () {
        help.command(command[1],finished);
    },
    log: function () {
        mmsLogin(function() {
            logview.showLog(command[1],command[2]);
        });         
    },
    templates : function() {
        create.listTemplates(finished);
    },
    test: function() {
        mmsLogin(function() {
            runtest.command(command[1],finished);
        });
    },
    undeploy: function() {
        mmsLogin(function() {
            deploy.undeploy(command[1],command[2],finished);
        });
    }
};

var commandArray = [];
for(var c in commandMap) {
    commandArray.push(c);
}
var commandCSV = commandArray.join(',');

main();

function main() {
    var argv = optimist.usage('Usage: $0')
        .options('allowGlobal', {describe: 'Allow global user operation'})
        .options('deleteTheme', {describe: 'Delete the theme rather than updating it'})
        .options('devtest', {describe: 'NPM install from local instance'})
        .options('help', {alias:'h'})
        .options('loggerName', {describe: 'Log message sources to include when monitoring MMS log  (e.g. "Node.js,com.emotive.mms.Rest20Controller"'})
        .options('logLevel', {describe: 'Log levels to show when monitoring MMS log (e.g. "AUDIT,INFO"'})
        .options('markThemePublic', {describe: 'When updating a theme mark the resources as public (internal use only)'})
        .options('model', {alias:'m', describe: 'JSON file of model for project to be created'})
        .options('password', {alias:'p', describe: 'Emotive password'})
        .options('profile', {alias:'f', describe: 'Profile containing user credentials'})
        .options('refreshInterval', {alias:'r', describe: 'Refresh interval (ms) for polling MMS log', "default": 5000})
        .options('server', {alias:'s', "default": DEFAULT_SERVER, describe: 'Emotive server URL'})
        .options('sfint', {describe: 'Model directory for Salesforce integration'})
        .options('template', {alias:'t', describe: 'Template name for object to be created'})
        .options('username', {alias:'u', describe: 'Emotive username'})
        .options('version', {describe: 'Print version number of emote from package.json'})
        .options('verbose', {alias:'v'})
        .options('tenant', {describe: 'Only show records from tenant n'})
        .options('regex', {describe: 'Only show records matching this regular expression'})
        .options('hide', {describe: 'Hide records matching this regular expression'})
        .options('local', {describe: 'Show times as local instead of GMT', "default":false})
        .options('tail', {describe: 'Tail mode', "default":false})
        .options('showNoise', {describe: 'Show normally uninteresting log messages', "default":false})
        .options('csv', {describe: 'Output in CSV format (time, tenant, username, level, message)', "default":false})
        .argv;

    if(argv.version) {
        console.log(pjson.version);
        process.exit(0);
    }

    console.log("emote " + pjson.version);

    if(argv.help) {
        optimist.showHelp();
        process.exit(0);
    }

    if(argv.model) {
        try {
            modelInit = JSON.parse(fs.readFileSync(argv.model,'utf8'));
        } catch(err) {
            console.log('Error with model ' + argv.model + ' : ' + err);
            process.exit(1);
        }
    }

    common.global.argv = argv;

    command = argv._;

    if(!command || !command[0]) {
        common.exit('Specify a command: ' + commandCSV);
    }

    if(argv.verbose) {
        console.log('Command is: ' + command[0]);
        common.setVerbose(true);
    }

    if(command[0]==="regression" && command[1]==="test") {
        // special entry point for regression test
        mmsLogin(function() {
            startRegressionTest();
        });
    } else {
        var commandFunction = commandMap[command[0]];
        if(!commandFunction) {
            common.exit('Command must be one of: ' + commandCSV);       
        }
        commandFunction();
    }
}

function readProfile(filename) {
    var profile;
    try {
        profile = JSON.parse(fs.readFileSync(filename,'utf8'));
    } catch(err) {
        console.log('Error with profile ' + filename + ' : ' + err);
        process.exit(1);
    }
    return profile;
}

function finished(err) {
    if(err) {
        console.log(err);
    }
    common.verbose('Command complete.');
}

function outputWriter(err,result,cb) {
    if(err) {
        console.log("Error:");
        console.dir(err);
    }

    if (typeof result == "string")
    {
        console.log(result);
    }
    else
    {
        console.log(util.inspect(result,true,null));
    }
    cb(err,result);
}

function mmsLogin(callback) {
    var config = common.gotoProjectHome(true);

    var argv = common.global.argv;
    if(argv.username || argv.password || argv.server != DEFAULT_SERVER) {
        if(!(argv.username && argv.password)) {
            common.exit("username and password must be specified on the command line")
        }
        //console.log("using command line credentials");
        mmsCreds = {server:argv.server, username:argv.username, password:argv.password};
    } else if(argv.profile) {
        //console.log("using command line profile");
        mmsCreds = readProfile(argv.profile);
    } else if(fs.existsSync(PROJECT_PROFILE)) {
        //console.log("using project profile");
        mmsCreds = readProfile(PROJECT_PROFILE);
    } else if(fs.existsSync(EMOTE_PROFILE)) {
        //console.log("using .emote_profile");
        mmsCreds = readProfile(EMOTE_PROFILE);
    } else {
        common.exit('MMS credentials must be specified on command line or in a profile.');
    }

    if(argv.verbose || argv.server != DEFAULT_SERVER) {
        console.log("Connecting to MMS as user " + mmsCreds.username + " at " + mmsCreds.server);
    }

    if(!argv.allowGlobal && (mmsCreds.username === "mms") && (command[0] != "log")) {
        common.exit("emote cannot be run as superuser.");
    }

    common.global.session = new mms.Session(mmsCreds);

    common.global.session.login(function(err) {
        if(err) {
            console.log("Failed to log in to MMS with credential provided: ");
            delete mmsCreds.password;
            console.dir(mmsCreds); 
            common.exit();
        }
        callback();
    });
}

function startRegressionTest() {

    // Convenience routine so testers can run the regression test without knowing the details
    // of how emote is deployed on their system

    var testDir = path.join(os.tmpDir(),"emote_regression_test");
    if(!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir);
    }
    process.chdir(testDir);

    var time = "" + new Date().getTime();
    fs.mkdirSync(time);
    process.chdir(time);

    // Write current credentials into temp directory so they can be used in test
    fs.writeFileSync('profile.json',JSON.stringify(mmsCreds),'utf-8');

    // fs.writeFileSync("output","Kilroy was here","utf-8");

    console.log("Running test in " + path.join(testDir,time));

    testDir = path.join(testDir,time);

    var script;

    if (os.platform() == 'win32')
    {
        script = "run.bat";
    }
    else
    {
        script = "run.sh";
    }

    var testScript = path.join(__dirname,"..","test",script);

    child_process.spawn(testScript, [], {
        stdio: [process.stdin, process.stdout, process.stderr], 
        cwd: testDir
    });
}
