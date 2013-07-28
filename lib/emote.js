"use strict";

var pjson = require('../package.json');
var emutils = require('emutils');
emutils.enableAnnouncements(false);

var async = require('async');
var child_process = require('child_process');
var fs = require('fs');
var util = require('util');
var optimist = require('optimist');
var path = require('path');
var os = require('os');

var common = require('./common');
var create = require('./create');
var download = require('./download');
var deploy = require('./deploy');
var help = require('./help');
var list = require('./list');
var logview = require('./logview');
var mms = require('./mms');
var mmscmd = require('./mmscmd');
var wsdl = require("./wsdl");
var runtest = require('./runtest');
var build = require('./build')

var command;
var packageRoot = "http://download.emotive.com/toolkit/";
var profileInfo = [];
var emoteMinimumVersion;

// This is the order in which directories of the project
// are processed for most commands
var typeOrder = ['model','proxy','code','app','operation','test','resource','theme'];
common.global.moduleOrder = typeOrder;
common.global.moduleTypes = common.addToMap({},typeOrder);

// The commandMap is the first place to look to figure out how a given command works
// This maps commands my name to a given  implementation.
// Note that some commands require MMS session login.
// MMS login is done in functions that are part of commandMap.
var commandMap = {
    add: function() {
        create.add(command[1],command[2],common.global.argv.template,finished);
    },
    build: function() {
        common.gotoProjectHome();
        // Note that common.command implements the basic logic of iterating over directories
        // using typeOrder. It needs to be passed an implementation, which is this case is
        // build.builders.
        common.command(build.builders,typeOrder,command[1],command[2],finished);
    },
    create: function() {
        var template = common.global.argv.template;
        if(template) {
            common.exit('The create command does not support the --template option.');
        }
        create.createProject(command[1],finished);
    },
    deploy: function() {
        mmsLogin(function() {
            // flag used to reduce verbosity when 'emote build' is not called explcitly
            common.global.silentBuild = true;
            // This is the same pattern as used above for 'build', followed by 'deploy'
            common.command(build.builders,typeOrder,command[1],command[2],function() {
                common.command(deploy.deployers,typeOrder,command[1],command[2],finished);
            });
        });
    },
    download: function() {
        mmsLogin(function() {
            download.getResourceAndWriteFiles(command[1],command[2],function(err) {
                // Downloaded samples that were unzipped *may* have overwritten
                // the project's "profile.json" -- if so, the old information from the
                // project.json should be merged into (and possible override)
                // the downloaded project.json
                if (err) {
                    return finished(err);
                }
                if(command[1] === "sample" && common.global.projectProfile) {
                    var profile = readProfile(common.PROJECT_PROFILE);
                    mergeCredentials(profile,common.global.projectProfile);
                    fs.writeFileSync(common.PROJECT_PROFILE,JSON.stringify(profile, null, '\t'));
                }
                finished();
            });
        });
    },
    exec: function() {
        mmsLogin(function() {
            mmscmd.execFile(command[1],common.global.session,outputWriter,finished);
        });
    },
    generateFromWsdl : function() {
        mmsLogin(function() {
            wsdl.generate(common.global.session, command[1], finished);
        })
    },
    getWsdl: function() {
        mmsLogin(function() {
            wsdl.getWsdl(common.global.session, command[1], command[2], command[3], command[4], command[5], command[6], finished);
        })
    },
    list : function() {
        mmsLogin(function() {
            list.doit(command[1],command[2],finished);
        });
    },
    log: function () {
        mmsLogin(function() {
            logview.showLog(command[1],command[2]);
        });
    },
    status: function () {
        mmsLogin(function() {
            console.log('Remote service compatible with emote version ' + emoteMinimumVersion + ' and up.');
            console.log('Logged into remote service successfully.');
            process.exit(0);
        });
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
    },
};

checkVersion(0, 10, 13);
main();

function checkVersion(major, minor, dot) {
    var version = process.version.substring(1).split(".");
    version.forEach(function(num, index, arr) {
        arr[index] = Number(num);    
    });

    if (version[0] != major) {
        console.log("Emote reuqires a version of node with major id " + major);
        process.exit();
    }
    if (version[1] < minor || (version[1] == minor && version[2] < dot)) {
        console.log("Emote reuqires node version " + major + "." + minor + "." + dot + " or laster");
        process.exit();        
    }

}


function main() {
    var argv = optimist.usage('Usage: $0')
        .options('allowGlobal', {describe: 'Allow global user operation'})
        .options('attributes', {alias:'a',describe: 'Attributes for list command'})
        .options('csv', {describe: 'Output log in CSV format (time, tenant, username, level, message)', "default":false})
        .options('deleteTheme', {describe: 'Delete the theme rather than updating it'})
        .options('devtest', {describe: 'NPM install from local instance'})
        .options('doc', {describe: 'Print the URL of the emotive docs site'})
        .options('emoteDir', {describe: 'Print the base directory for the emote installation'})
        .options('help', {alias:'h'})
        .options('hide', {describe: 'Hide records in log matching this regular expression'})
        .options('includeGlobal', {alias:'g', describe: 'Include global CDM objects in list command output'})
        .options('local', {describe: 'Show times in log as local instead of GMT', "default":false})
        .options('loggerName', {describe: 'Log message sources to include when monitoring MMS log'})
        .options('logLevel', {describe: 'Log levels to show when monitoring MMS log (e.g. "AUDIT,INFO"'})
        .options('markThemePublic', {describe: 'When updating a theme mark the resources as public'})
        .options('nonInteractive', {describe: 'Emote is being run non-interactively'})
        .options('password', {alias:'p', describe: 'Emotive password'})
        .options('profile', {alias:'f', describe: 'Profile containing user credentials'})
        .options('readme', {describe: 'Print the README.md file for emote to stdout'})
        .options('refreshInterval', {alias:'r', describe: 'Refresh interval (ms) for polling MMS log', "default": 5000})
        .options('regex', {describe: 'Only show records in log matching this regular expression'})
        .options('separator', {alias:'S', describe: 'Column seperator for list command'})
        .options('server', {alias:'s', describe: 'Emotive server URL'})
        .options('showNoise', {describe: 'Show normally uninteresting log messages', "default":false})
        .options('tail', {describe: 'Tail mode', "default":false})
        .options('template', {alias:'t', describe: 'Template name for object to be created'})
        .options('tenant', {describe: 'Only show log records from tenant n'})
        .options('username', {alias:'u', describe: 'Emotive username'})
        .options('verbose', {alias:'v'})
        .options('version', {describe: 'Print version number of emote'})
        .options('whoami', {describe: 'Print username obtained from the profile'})
        .argv;

    common.global.argv = argv;
    command = argv._;

    function userString(mmsCreds) {
        return (mmsCreds ?
            (mmsCreds.username ? mmsCreds.username : 'NO USER SPECIFIED') + ' on ' + mmsCreds.server :
            'NO USER SPECIFIED');
    }

    function info() {
        var mmsCreds = mergeAllCredentials();
        console.log('version   ' + pjson.version);
        console.log('profile   ' + profileInfo.join('\n          '));
        console.log('username  ' + userString(mmsCreds));
        console.log('project   ' + (common.global.projectConfig ? common.global.projectConfig.name : "none"));
        process.exit(0);
    }


    // If no command is specified, then look for options to process the "default action"
    // The default action exits right after printing status to the console
    if(!command || !command[0]) {
        if (argv.info) {
            info()
        }
        if(argv.help) {
            var fn = path.join(__dirname,"..","help.txt");
            var text = fs.readFileSync(fn,"utf8");
            console.log(text);
            optimist.showHelp();
            process.exit(0);
        }
        if(argv.readme) {
            help.command(null,process.exit);
        }
        if (argv.emoteDir) {
            console.log(path.resolve(__dirname, ".."));
            process.exit(0);
        }
        if(argv.version || argv.whoami || argv.doc) {
            if(argv.version) {
                console.log(pjson.version);
            }
            if (argv.whoami) {
                var mmsCreds = mergeAllCredentials();
                console.log(userString(mmsCreds));
            }
            if (argv.doc) {
                var mmsCreds = mergeAllCredentials();
                console.log("http://docs.emotive.com");
            }
            process.exit(0);
        } else {
            info()
        }
    }

    if(argv.verbose) {
        // This set up the "common.verbose()" for verbose log messages
        common.setVerbose(true);
    }

    common.verbose('Command is ' + command[0]);

    if(command[0]==="regression" && command[1]==="test") {
        // special entry point for "emote regression test"
        mmsLogin(function() {
            startRegressionTest(command[2]);
        });
    } else {
        var commandFunction = commandMap[command[0]];
        if(!commandFunction) {
            common.exit('Command must be one of: ' + common.objToArr(commandMap).join(','));
        }
        // At this point commandFunction() is the approriate command from the commandMap()
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

// Just used as a genric callback, when a command completes
// and there is no subsequent action
function finished(err) {
    if(err) {
        console.log(err);
    }
    common.verbose('Command complete.');
}

// Provides console output for "exec" command
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

// Used by mergeAllCredentials
function mergeCredentials(target,source) {
    for(var prop in source) {
        var value = source[prop];
        if(emutils.type(value) === 'string') {
            target[prop] = value;
        }
    }
    if(source.externalCredentials) {
        if(!target.externalCredentials) {
            target.externalCredentials = source.externalCredentials;
        } else {
            for(var prop in source.externalCredentials) {
                target.externalCredentials[prop] = source.externalCredentials[prop];
            }
        }
    }
}

// Implements precendence for merging credentals from:
// (1) command line
// (2) profile.json
// (3) .emote_profile
function mergeAllCredentials() {
    var argv = common.global.argv;
    var config = common.gotoProjectHome(true);

    var mmsCreds = {server:common.DEFAULT_SERVER};

    if(argv.profile) {
        common.verbose("Reading profile specified on command line.");
        profileInfo.push(argv.profile);
        mergeCredentials(mmsCreds,readProfile(argv.profile));
    } else {
        if(fs.existsSync(common.EMOTE_PROFILE)) {
            common.verbose("Reading profile from " + common.EMOTE_PROFILE);
            profileInfo.push(common.EMOTE_PROFILE);
            mergeCredentials(mmsCreds,readProfile(common.EMOTE_PROFILE));
        }
        if(fs.existsSync(common.PROJECT_PROFILE)) {
            common.verbose("Reading profile from project root.");
            profileInfo.unshift(common.PROJECT_PROFILE);
            common.global.projectProfile = readProfile(common.PROJECT_PROFILE);
            mergeCredentials(mmsCreds,common.global.projectProfile);
        }
    }

    if(argv.username) mergeCredentials(mmsCreds,{username:argv.username});
    if(argv.password) mergeCredentials(mmsCreds,{password:argv.password});
    if(argv.server) mergeCredentials(mmsCreds,{server:argv.server});

    return mmsCreds;
}

// Gets credentials from merging profile.json (see above)
// Then prompts at command line for any credentials
// with value of <<.*>>
function getCredentials(cb /*function(credentials)*/) {
    var argv = common.global.argv;
    var mmsCreds = mergeAllCredentials();

    common.getUserInputForCredentials(mmsCreds,function(mmsCreds) {

        if(!(mmsCreds.username && mmsCreds.password)) {
            common.exit('MMS credentials must be specified on the command line or in a profile.');
        }

        if(argv.verbose || argv.server != common.DEFAULT_SERVER) {
            console.log("Connecting to MMS as user " + mmsCreds.username + " at " + mmsCreds.server);
        }

        if(!argv.allowGlobal && (mmsCreds.username === "mms") && (command[0] != "log")) {
            common.exit("emote cannot be run as superuser.");
        }

        cb(mmsCreds);
    });
}

// This is the 'entry point' for login that is used by functions in the commandMap
function mmsLogin(callback) {
    getCredentials(function(mmsCreds) {
        common.global.session = new mms.Session(mmsCreds);
        mmsLoginToSession(callback);
    });
}

function mmsLoginToSession(callback) {

    common.global.session.login(function(err) {
        if(err) {
            if(err.code==='ECONNREFUSED') {
                console.log('Emote unable to establish a connection to the remote service.');
                console.log('Check the URL of the remote service: ' + common.global.session.creds.server);
            } else {
                console.log('User ' + common.global.session.creds.username + ' failed to log in to MMS with credentials provided.');
                if(err.code === 'authfail') {
                    console.log(err.message);
                } else if(err.statusCode === 404) {
                    console.log('Returned 404, Not Found');
                    console.log('Check the URL of the remote service: ' + common.global.session.creds.server);
                } else {
                    console.log(err.message);
                    console.log('Returned HTTP status ' + err.statusCode)
                    console.log('Check the URL of the remote service: ' + common.global.session.creds.server);
                }
            }
            common.exit();
        }

        // The first query to MMS is always to check for mms version compatilibity with emote
        common.global.session.directive({
            "op": "INVOKE",
            "targetType": "CdmSystemStatus",
            "name": "systemProperty",
            "params": {"name": "emoteMinimumVersion"}
        },function(err,res) {
            if(!res.results
            || !res.results.length===1
            || !res.results[0]
            || !res.results[0].name==='emoteMinimumVersion')
            {
                console.log('Unexpected response from MMS query for emote version:');
                console.dir(res);
                common.exit();
            }

            emoteMinimumVersion = res.results[0].value;

            var versionSplit = pjson.version.split('.');
            var minVersionSplit = emoteMinimumVersion.split('.');
            versionSplit.forEach(function(row, index, array) {
                array[index] = parseInt(row);     
            });
            minVersionSplit.forEach(function(row, index, array) {
                array[index] = parseInt(row);     
            });
            var versionOK = false;

            if(versionSplit[0] > minVersionSplit[0]) {
                versionOK = true;
            } else if(versionSplit[0] === minVersionSplit[0]) {
                if(versionSplit[1] > minVersionSplit[1]) {
                    versionOK = true;
                } else if(versionSplit[1] === minVersionSplit[1]) {
                    if(versionSplit[2] >= minVersionSplit[2]) {
                        versionOK = true;
                    }
                }
            }

            if(!versionOK) {
                common.exit('The MMS server you are connecting to requires emote to be at least version ' + emoteMinimumVersion);
            }

            callback();
        });
    });
}

function startRegressionTest(testName) {

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

    var mmsCreds = common.global.session.creds;

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

    var params = testName ? [testName] : [];
    child_process.spawn(testScript, params, {
        stdio: "inherit",
        cwd: testDir
    });
}

