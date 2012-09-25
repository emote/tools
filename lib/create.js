"use strict";
var async = require('async');
var fs = require('fs');
var generate = require('./generate');
var npm = require('npm');
var path = require('path');
var rimraf = require('rimraf');
var common = require('./common');

var existingProxies;
var mmsAppPath = '/tasklets/';
var templateRoot = path.join(__dirname,"..","template");
var binaryExtensions = {'.png':true, '.gif':true, '.jpeg':true, '.jpg':true};

exports.global = {};

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

exports.add = function add(artifactType,artifactId,targetId,modelInit,templateName,session,callback) {
    common.gotoProjectHome();

    if (!targetId) {
        targetId = artifactId;
    }
    if(!modelInit) {
        modelInit = {name:"addin"};
    }
    if (fs.existsSync("proxy")) {
        existingProxies = fs.readdirSync("proxy");
        if (targetId != artifactId) {
            var tmp = [];
            existingProxies.forEach(function(row) {
                if(row !== targetId) {
                    tmp.push(row);
                }
            });
            existingProxies = tmp;
        }
    }
    else {
        existingProxies = [];
    }

    var partPath = path.join(artifactType,artifactId)
    var targetPath = path.join(artifactType,targetId);
    var templatePath = path.join(getTemplateDir(templateName),partPath);
    if(!fs.existsSync(templatePath)) {
        console.log('There is no "' + partPath + '" in template: ' + templateName);
        // console.log(templatePath + ' and ' + process.cwd());
        process.exit(1);
    }

    var templateFiles = findFiles(templatePath);

    addFilesFromDir(getTemplateDir(templateName),partPath,targetPath,modelInit,function(err) {
        if(err) {
            console.log('Failure while iterating over template directory: ' + err);
            process.exit(1);
        }
        if (fs.existsSync('proxy'))
        {
            npmInstallForGeneratedPackages(function(err,count) {
                console.log('Added ' + artifactType);
            });
        }
        else
        {
            console.log('Added ' + artifactType + '.');
        }
    });
}

exports.download = function downloadApp(artifactType,appId,session,callback) {

    if(artifactType != "app") {
        console.log("Unsupported artifact type: " + artifactType);
        process.exit(1);
    }

    common.gotoProjectHome();
    process.chdir(artifactType);

    try {
        fs.mkdirSync(appId);
    } catch(err) {
        console.log('A directory with name ' + appId + ' already exists.');
        //process.exit(1);
    }
    process.chdir(appId);

    var filter = mmsAppPath+appId+'/';

    session.directive({
        op: 'SELECT',
        targetType: 'CdmResource',
        properties: ['id','name'],
        where: {name: {$regex:filter}}
    },function(err,result) {
        if(err) {
            console.log('Error selecting apps: ' + err);
            process.exit(1);
        }
        if(!result || !result.results) {
            console.dir(result);
            console.log('No app found with appId=' + appId);
            process.exit(1);
        }

        async.forEachSeries(result.results,
            function(row,cb) {
                var filename = row.name.substring(filter.length);
                //console.log(filename);
                session.getResource(row.name,function(err,body,isText) {
                    if(insurePathExists(filename)) {
                        fs.writeFileSync(filename,body);
                        cb();
                    } else {
                        process.exit(1);
                    }
                });
            },
            function(err) {
                console.log('Finished downloading app ' + appId);
            }
        );
    });
}

exports.listTemplates = function(cb) {
    var templates = fs.readdirSync(templateRoot);
    async.map(templates,function(item,cb) {
        var description = '';
        var fn = path.join(item,'README');
        if(fs.existsSync(fn)) {
            description = fs.readFileSync(fn,'utf-8')
        }
        console.log(item + (item.length>7 ? '\t' : '\t\t') + description);
        cb();
    },cb);
}

exports.newProject = function createProject(projectName,modelInit,templateName,session,callback) {
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

    existingProxies = []; // This is needed for NPM install of proxies later

    // Generate Project Source From Template

    var projectConfig = {name: projectName, template: templateName};
    fs.writeFileSync('project.json',JSON.stringify(projectConfig, null, '\t'));

    if(!templateName) {
        templateName = "default";
    }
    var templateDir = getTemplateDir(templateName);

    addFilesFromDir(templateDir,null,null,modelInit,function(err) {
        if(err) {
            console.log('Failure while iterating over template directory: ' + err);
            process.exit(1);
        }
        if (fs.existsSync('proxy'))
        {
            npmInstallForGeneratedPackages(function() {
                console.log('Created project ' + projectName);
            });
        }
        else
        {
            console.log('Created project ' + projectName);
        }
    });
}

function addFilesFromDir(templateDir,partPath,targetPath,modelInit,callback) {
    var fullPartPath = path.join(templateDir,partPath);
    var templateFiles = findFiles(fullPartPath);

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
            relativeName = workaroundNpmBug(relativeName)

            insurePathExists(relativeName);
            fs.writeFileSync(relativeName,target);

            cb();

        },callback
    );  
}

function workaroundNpmBug(relativeName) {
    // npm has either a "bug" or a "feature" 
    // where subdirectories called node_modules 
    // are not always copied over by npm install.
    // For this reason, in the templates directory, subdirectories called "node_modules" are
    // renamed to "node_modules_xxx", and then we undo the rename here.

    var parts = relativeName.split(path.sep);
    for(var i=0;i<parts.length;i++) {
        if(parts[i] === "node_modules_xxx") {
            parts[i] = "node_modules";
        }
    }
    return parts.join(path.sep);
}

function findFiles(dirName) {
    var files = [];
    addDir(dirName,files);
    return files;
}

function addDir(dirName,files) {
    var ls = fs.readdirSync(dirName);
    for(var i=0; i<ls.length; i++) {
        var fn = ls[i];
        if(fn.charAt(0) != '.') { // ignore hidden files
            var qn;
            if(dirName === '.') {
                qn = fn;
            } else {
                qn = dirName + '/' + fn;
            }

            var stats = fs.statSync(qn);
            if(stats.isDirectory()) {
                addDir(qn,files);
            } else {
                files.push(qn);
            }
        }
    }
}

function npmInstallForGeneratedPackages(callback) {
    if (fs.existsSync("node_modules")) {
        console.log("There is an existing node_modules directory in your project left over from a previous failure.");
        console.log("Please delete it.");
        process.exit(1);
    }
    fs.mkdirSync("node_modules");
    //console.log('Current directory: ' + process.cwd());

    var excludeExisting = {};
    existingProxies.forEach(function(item) {
        excludeExisting[item]=true; 
    });

    var packageList = [];
    var ls = fs.readdirSync("proxy");
    ls.forEach(function(item) {
        if(!excludeExisting[item]) {
            packageList.push(path.join("proxy",item));
        }
    });

    async.forEachSeries(packageList,installWithNpm,function(err) {
        if(err) {
            console.log('Failure on npm install of generated packages: ' + err);
            process.exit(1);
        } else {
            fs.rmdirSync("node_modules");
            console.log("Completed install of new proxies with NPM.");
            callback();
        }
    });
}

function installWithNpm(pkg,callback) {
    npm.load({},function(err,npmobj) {
        if(err) {
            console.log('Error loading npm: ' + err);
            process.exit(1);
        }
        npmobj.install(pkg,function(err) {
            if(err) {
                console.log("Error in NPM install of " + pkg);
                process.exit(1);
            }
            rimraf(pkg,function(err) {
                if(err) {
                    console.log('Failure "rm -rf" of generated packages: ' + err);
                    process.exit(1);
                }
                // Add a small delay before the rename because we detected an
                // intermittant race condition using rimraf on Windows
                setTimeout(function() {
                    fs.renameSync(path.join("node_modules",path.basename(pkg)),pkg);
                    callback();
                },1000);                          
            });
        });
    }); 
}

exports.insurePathExists = insurePathExists;

function insurePathExists(filename) {
    var retval = true;
    var pathArr = filename.split(path.sep)
    var simpleName = pathArr.pop();
    var currentPath = ".";
    pathArr.forEach(function(dirName) {
        if(dirName) { // list starts with null dirName for an absolute path
            currentPath = path.join(currentPath,dirName);
            if(fs.existsSync(currentPath)) {
                if(!fs.statSync(currentPath).isDirectory()) {
                    console.log("File" + currentPath + " exists. Cannot create directory.");
                    retval = false;
                }
            } else {
                fs.mkdirSync(currentPath);
            }
        }
    });
    return retval; 
}

