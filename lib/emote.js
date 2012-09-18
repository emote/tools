"use strict";
/*jshint node:true globalstrict:true laxcomma:true smarttabs:true undef:true */

var async = require('async');
var fs = require('fs');
var util = require('util');
var optimist = require('optimist');

var pjson = require('../package.json');

var common = require('./common');
var create = require('./create');
var deploy = require('./deploy');
var help = require('./help');
var logview = require('./logview');
var mms = require('./mms');
var mmscmd = require('./mmscmd');

var EMOTE_PROFILE = process.env.HOME + "/.emote_profile";
var PROJECT_PROFILE = "profile.json";

var argv;
var command;
var session;
var packageRoot = "http://download.emotive.com/toolkit/";
var modelInit;

// Note that some commands require MMS session login
// MMS login is done in functions that are part of commandMap
// TODO: should not retry on failed login, should just exit
var commandMap = {
    add: function() { 
        create.add(command[1],command[2],modelInit,argv.template,session,finished);
    },
    clean: function() { 
        mmsLogin(function() {
            mmscmd.cleanExternalSystem(session,command[1],finished);
        });
    },
    cleanAll: function() { 
        mmsLogin(function() {
            mmscmd.cleanTenant(session,finished);
        }); 
    },
    create: function() { 
        create.newProject(command[1],modelInit,argv.template,session,finished); 
    },
    deploy: function() { 
        mmsLogin(function() {
            deploy.command(command[1],command[2],session,finished); 
        }); 
    },
    download: function() { 
        mmsLogin(function() {
            create.download(command[1],command[2],session,finished); 
        }); 
    },
    exec: function() { 
        mmsLogin(function() {
            mmscmd.execFile(command[1],session,outputWriter,finished); 
        }); 
    },
    help: function () {
        help.command(command[1],finished);
    },
    log: function () {
        mmsLogin(function() {
            logview.showLog(session,argv,command[1],command[2]);
        });         
    },
    templates : function() {
        create.listTemplates(finished);
    },
    undeploy: function() {
        mmsLogin(function() {
            deploy.undeploy(command[1],command[2],session,finished);
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
    argv = optimist.usage('Usage: $0')
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
        .options('server', {alias:'s', "default": "http://mms.emotive.com", describe: 'Emotive server URL'})
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

    deploy.global.argv = argv;
    create.global.argv = argv;

    if(argv.model) {
        try {
            modelInit = JSON.parse(fs.readFileSync(argv.model,'utf8'));
        } catch(err) {
            console.log('Error with model ' + filename + ' : ' + err);
            process.exit(1);
        }
    }

    command = argv._;

    if(!command || !command[0]) {
        console.log('Specify a command: ' + commandCSV);
        process.exit(1);
    }

    if(argv.verbose) {
        console.log('Command is: ' + command[0]);
    }

    var commandFunction = commandMap[command[0]];

    if(!commandFunction) {
        console.log('Command must be one of: ' + commandCSV);       
        process.exit(1);
    }

    commandFunction();
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
    } else if(argv.verbose) {
        console.log('Command complete.');
    }
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

    var mmsCreds;
    if(argv.username) {
        mmsCreds = {server:argv.server, username:argv.username, password:argv.password};
    } else if(argv.profile) {
        mmsCreds = readProfile(argv.profile);
    } else if(fs.existsSync(PROJECT_PROFILE)) {
        mmsCreds = readProfile(PROJECT_PROFILE);
    } else if(fs.existsSync(EMOTE_PROFILE)) {
        mmsCreds = readProfile(EMOTE_PROFILE);
    } else {
        console.log('MMS credentials must be specified on command line or in a profile.');
        process.exit(1);
    }

    if(argv.verbose) {
        console.log("Connecting to MMS as user " + mmsCreds.username + " at " + mmsCreds.server);
    }

    if(!argv.allowGlobal && (mmsCreds.username === "mms") && (command[0] != "log")) {
        console.log("emote cannot be run as superuser.");
        process.exit(1);
    }

    session = new mms.Session(mmsCreds.server);
    session.username = mmsCreds.username;
    session.password = mmsCreds.password;
    session.login(callback);
}