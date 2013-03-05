"use strict";
var async = require('async');
var fs = require('fs');
var npm = require('npm');
var path = require('path');
var rimraf = require('rimraf');
var common = require('./common');
var pjson = require('../package.json');
var emutils = require('emutils');

var mmsAppPath = '/tasklets/';
var templateRoot = path.join(__dirname,"..","template");
var binaryExtensions = {'.png':true, '.gif':true, '.jpeg':true, '.jpg':true};

exports.createProject = createProject;
function createProject(projectName,callback) {
    if(!projectName) {
        console.log('Must supply a project name for createProject that is a legal directory name.');        
        process.exit(1);
    }

    try {
        fs.mkdirSync(projectName);
    } catch(err) {
        console.log("Cannot create project directory: '" + projectName + "'. Cause is " + err);
        process.exit(1);
    }
    process.chdir(projectName);

    fs.mkdirSync('app');
    fs.mkdirSync('model');
    fs.mkdirSync('proxy');

    var projectConfig = {name: projectName, toolsVersion:pjson.version};
    fs.writeFileSync('project.json',JSON.stringify(projectConfig, null, '\t'));

    if(!fs.existsSync(common.EMOTE_PROFILE)) {
        // If no global .emote_profile exists, automatically create a profile.json in the project
        // with prompts for server, username, and password
        var default_prompts = {
            "server":"<<Emotive server URL>>" + common.DEFAULT_SERVER, 
            "username":"<<Emotive username>>", 
            "password":"<<Emotive password>>"
        };
        fs.writeFileSync('profile.json',JSON.stringify(default_prompts, null, '\t'));
    }

    console.log('Created empty project ' + projectName);
    callback();
}

var _templateDir;
function getTemplateDir(templateName) {
    if(!_templateDir) {
        if(!templateName) {
            templateName = "default";
        }
        _templateDir = path.join(templateRoot,templateName);
        if(!fs.existsSync(_templateDir)) {
            console.log('There is no template: ' + templateName);
            process.exit(1);
        }
    }
    return _templateDir;    
}

exports.listTemplates = listTemplates;
function listTemplates(cb) {
    var templates = fs.readdirSync(templateRoot);
    async.map(templates,function(item,cb) {
        if(item.charAt(0) != "_") {
            var description = '';
            var fn = path.join(item,'README');
            if(fs.existsSync(fn)) {
                description = fs.readFileSync(fn,'utf-8')
            }
            console.log(item + (item.length>7 ? '\t' : '\t\t') + description);
            cb();
        }
    },cb);
}

function validModuleName(candidate) {
    var validName = /^[$A-Z_][0-9A-Z_$]*$/i;
    return validName.test(candidate);
}

// Implements the 'emote add' command
exports.add = add;
function add(moduleTypes,moduleName,templateName,callback) {

    var moduleTypeArr;
    if(!moduleTypes) {
        common.exit('add command must supply the type of object to be added.' 
            + '\nMust be one of: all ' + common.global.moduleOrder.join(' ')
            + '\nor a combination joined with +.');
    } else if(moduleTypes === 'all') {
        moduleTypeArr = common.global.moduleOrder;
    } else {
        moduleTypeArr = moduleTypes.split('+');
        moduleTypeArr.forEach(function(moduleType) {
            if(!common.global.moduleTypes[moduleType]) {
                common.exit('add command must supply the type of object to be added.' 
                    + '\nMust be one of: all ' + common.global.moduleOrder.join(' ') 
                    + '\nor a combination joined with +.');
            }
        });
    }

    if(!moduleName || !validModuleName(moduleName)) {
        common.exit(moduleName + ' is not a valid name for a module. Module names must match: /^[$A-Z_][0-9A-Z_$]*$/i');
    }

    common.gotoProjectHome();

    async.forEachSeries(moduleTypeArr, function(moduleType, cb) {
        if(templateName) {
            var partPath = path.join(moduleType,'default')
            var targetPath = path.join(moduleType,moduleName);
            var templatePath = path.join(getTemplateDir(templateName),partPath);
            if(!fs.existsSync(templatePath)) {
                if(moduleTypes != 'all') {
                    console.log('There is no "' + partPath + '" in template: ' + templateName);
                }
                cb();
            } else {
                // Special case to handle externalCredentials required for a proxy.
                // Proxy templates that will require external credentials must contain a file
                // named externalCredentials.json that includes the name of the field required 
                // in the external credentials and the prompts used for the field.
                // See tools/template/Salesforce/externalCredential.json as an example.
                // Those values are merged into the generated profile.json for the new project.
                if(moduleType === 'proxy') {
                    var patternFile = path.join(getTemplateDir(templateName),'externalCredentials.json');
                    if(fs.existsSync(patternFile)) {
                        var credentialPattern = common.getJSON(patternFile);
                        addExternalCredentialsToProfile(moduleName,credentialPattern);
                    }
                }

                console.log('Adding ' + moduleType + ' from template ' + templateName);
                addFilesFromDir(getTemplateDir(templateName),partPath,targetPath,function(err) {
                    if(err) {
                        console.log('Failure while iterating over template directory: ' + err);
                        process.exit(1);
                    }
                    cb();
                });
            }
        } else {
            if (!fs.existsSync(moduleType)) fs.mkdirSync(moduleType);
            process.chdir(moduleType);
            if (!fs.existsSync(moduleName)) fs.mkdirSync(moduleName);
            process.chdir('..');
            cb();
        }
    }, callback);
}

function addFilesFromDir(templateDir,partPath,targetPath,callback) {
    var fullPartPath = path.join(templateDir,partPath);
    var templateFiles = common.findFiles(fullPartPath);

    async.forEachSeries(templateFiles,
        function(filename,cb) {

            var relativeName = path.join(targetPath, path.relative(fullPartPath,filename));
            common.insurePathExists(relativeName);

            emutils.copyFile(filename, relativeName, cb)

        },callback
    );  
}

function addExternalCredentialsToProfile(moduleName,credentialPattern) {
    var profilePath = path.join(global.projectHome,'profile.json')
    var profile = common.getJSON(profilePath);

    if(!profile) profile = {};
    if(!profile.externalCredentials) profile.externalCredentials = {};
    if(!profile.externalCredentials[moduleName]) {
        profile.externalCredentials[moduleName] = credentialPattern;
    }
    fs.writeFileSync(profilePath,JSON.stringify(profile, null, '\t'));
}

