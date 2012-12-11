"use strict";
var async = require('async');
var fs = require('fs');
var generate = require('./generate');
var npm = require('npm');
var path = require('path');
var rimraf = require('rimraf');
var common = require('./common');
var pjson = require('../package.json');

var mmsAppPath = '/tasklets/';
var templateRoot = path.join(__dirname,"..","template");
var binaryExtensions = {'.png':true, '.gif':true, '.jpeg':true, '.jpg':true};

exports.newProject = function createProject(projectName,modelInit,templateName,callback) {
    if(!projectName) {
        console.log('Must supply a project name for createProject that is a legal directory name.');        
        process.exit(1);
    }
    if(!modelInit) {
        modelInit = {name:projectName};
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

    var projectConfig = {name: projectName, template: templateName, toolsVersion:pjson.version};
    fs.writeFileSync('project.json',JSON.stringify(projectConfig, null, '\t'));

    console.log('Created empty project ' + projectName);
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

exports.listTemplates = function(cb) {
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

exports.add = function add(artifactType,artifactId,targetId,modelInit,templateName,callback) {
    common.gotoProjectHome();

    if (!targetId) {
        targetId = artifactId;
    }
    if(!modelInit) {
        modelInit = {name:"addin"};
    }

    var partPath = path.join(artifactType,artifactId)
    var targetPath = path.join(artifactType,targetId);
    var templatePath = path.join(getTemplateDir(templateName),partPath);
    if(!fs.existsSync(templatePath)) {
        console.log('There is no "' + partPath + '" in template: ' + templateName);
        // console.log(templatePath + ' and ' + process.cwd());
        process.exit(1);
    }

    var templateFiles = common.findFiles(templatePath);

    addFilesFromDir(getTemplateDir(templateName),partPath,targetPath,modelInit,function(err) {
        if(err) {
            console.log('Failure while iterating over template directory: ' + err);
            process.exit(1);
        }
    });
}

function addFilesFromDir(templateDir,partPath,targetPath,modelInit,callback) {
    var fullPartPath = path.join(templateDir,partPath);
    var templateFiles = common.findFiles(fullPartPath);

    async.forEachSeries(templateFiles,
        function(filename,cb) {
            var fileExtension = path.extname(filename);

            var target;

            if (binaryExtensions[fileExtension])
            {
               target = fs.readFileSync(filename);
            }
            else {
                var source = fs.readFileSync(filename,'utf8');
                target = generate.fromTemplate(source,modelInit);

                // If generated code is JSON, eval and Stringify to make sure syntax is OK.
                if(fileExtension === ".json") {
                    var jsToEval = ['(',target,')'].join('');
                    var product;
                    try {
                        product= eval(jsToEval);
                    } catch(err) {
                        console.log('Error evaluating expression in template ' + filename);
                        console.log(err);
                        //console.log(err.stack);
                        process.exit(1);
                    }
                    target = JSON.stringify(product, null, '\t');
                }
            }

            var relativeName = path.join(targetPath, path.relative(fullPartPath,filename));

            common.insurePathExists(relativeName);
            fs.writeFileSync(relativeName,target);

            cb();

        },callback
    );  
}

