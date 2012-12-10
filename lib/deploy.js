"use strict";
var async = require('async');
var crypto = require('crypto');
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

    session.console("saveMiniApp",parts,function (err,resultObject)
    {
        if (resultObject == "UPDATED")
        {
            console.log("App " + filename + " updated");
        }
        else if (resultObject == "ADDED")
        {
            console.log("App " + filename + " added");
        }
        else if (resultObject)
        {
            console.log(resultObject);
        }

        callback(err,resultObject);
    });
}

exports.deployers = {
    proxy : function(dirname,cb) {
        session = common.global.session;

        var installPath = path.join(process.cwd(),dirname);

        var pkgName = common.getJSON(path.join(dirname,"package.json")).name;
        if(!pkgName) common.exit('name missing from package.json in proxy ' + pkg);

        common.pushdProjectHome(function(callback) {

            try {
                process.chdir(path.join('staging',dirname,'node_modules'));
            } catch (err) {
                common.exit('The proxy ' + dirname + ' must be built before it can be deployed.\nUse "emote build"')
            }

            var data = zipper.zipDirToBuffer(pkgName,ignoreFiles);
            var shasum = crypto.createHash('sha1'); 
            shasum.update(data);
            var shahex = shasum.digest('hex');
            mmscmd.updateProxyDigest(session,dirname,shahex,function(err,result) {
                if(err) {
                    console.log(err);
                    process.exit(1);
                }
                uploadResourceToMMS(dirname,data,cb);
            });
        },cb);
    },

    app : function(dirname,cb) {
        session = common.global.session;
        var params = common.getJSON(path.join(dirname,'app.json'));
        uploadAppToMMS(dirname,params,zipper.zipDirToBuffer(dirname,{}),cb);
    },

    operation : function(dirname,cb) {
        session = common.global.session;
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
        session = common.global.session;
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
        session = common.global.session;
        // steve call code in theme.js
        theme.update(session,dirname,cb,common.global.argv.deleteTheme,common.global.argv.markThemePublic);
    }

};


exports.undeploy = function undeploy(type, name, cb) {
    session = common.global.session; // Only one mms session for emote, so this works

    if (!type)
    {
        console.log("A type must be specified for undeploy (app, model, operation, or theme)");
        process.exit(1);
    }
    else if (type == "theme")
    {
        if(!name) {
            name = "default";
        }
        var config = common.gotoProjectHome();
        process.chdir(type);
        theme.update(mmsSession,name,cb,true,false);
    }
    else if (type == "app")
    {
        if(!name)
        {
            console.log("The name of an app to undeploy must be specified");
            process.exit(1);
        }

        //
        //  The name must be an existing taskletId; we don't care whether there is an actual app
        //  directory with this name or not.
        //
        undeployApp(name);
    }
    else if (type == "operation")
    {
        if(!name)
        {
            console.log("The name of an operation to undeploy must be specified");
            process.exit(1);
        }

        if (!fs.existsSync(type))
        {
            console.log('There is no subdirectory ' + type + ' in this project.');
            process.exit(1);
        }

        process.chdir(type);

        if (!fs.existsSync(name))
        {
            console.log('There is no subdirectory ' + type + '/' + name + ' in this project.');
            process.exit(1);
        }

        process.chdir(name);

        if (fs.existsSync('operation.json'))
        {
            virtualop.undeployVirtualOp(session,function(err) {
                process.chdir('..');
                cb(err);
            });
        }
        else
        {
            console.log('There is no operation.json file in directory ' + type + '/' + name + ' of this project.');
            process.exit(1);
        }
    }
    else if (type == "model")
    {
        if(!name)
        {
            mmscmd.cleanTenant(session,cb);
        }
        else
        {
            mmscmd.cleanExternalSystem(session,name,cb);
        }
    }
    else
    {
        console.log("undeploy not implemented for type " + type);
        process.exit(1);
    }
}

//
//  These variables all pertain to the "undeploy app" function.
//
var tenantId = 0;
var tenantName = null;
var taskletId = null;
var cdmTasklet = null;
var cdmResources = null;

function undeployApp(name)
{
    taskletId = name;

    //
    //  First we need the tenantId for the currently logged in user
    //
    var obj = new Object();

    obj.op = "SELECT";
    obj.targetType = "CdmUser";
    obj.properties = ["id","tenantId"];
    obj.where = new Object();
    obj.where.username = session.creds.username;

    session.directive(obj,onGetUser);
}

function onGetUser(err,resultObject)
{
    if (resultObject.targetType == 'RestResponse')
    {
        if (resultObject.status == 'SUCCESS')
        {
            if (resultObject.results.length == 1)
            {
                var cdmUser = resultObject.results[0];
                tenantId = cdmUser.tenantId;

                //
                //  Now we can get the CdmOrganization for the current user
                //
                var obj1 = new Object();
                obj1.op = "SELECT";
                obj1.targetType = "CdmOrganization";
                obj1.properties = ["id","name","tenantId"];
                obj1.where = new Object();
                obj1.where.tenantId = tenantId;

                session.directive(obj1,onGetOrganization);
            }
            else
            {
                console.log("No CdmUser found!");
                process.exit(1);
            }
        }
        else
        {
            console.log(resultObject.status);
            process.exit(1);
        }
    }
    else
    {
        console.log("Not a RestResponse?");
        process.exit(1);
    }
}

function onGetOrganization(err,resultObject)
{
    if (resultObject.targetType == 'RestResponse')
    {
        if (resultObject.status == 'SUCCESS')
        {
            if (resultObject.results.length == 1)
            {
                var cdmOrg = resultObject.results[0];
                tenantName = cdmOrg.name;

                //
                //  Now we can get the CdmTasklet and the CdmResources that comprise it.
                //
                var obj1 = new Object();
                obj1.op = "SELECT";
                obj1.targetType = "CdmTasklet";
                obj1.properties = ["id","name","taskletId"];
                obj1.where = new Object();
                obj1.where.taskletId = taskletId;
                obj1.where.tenantId = tenantId;

                var obj2 = new Object();
                obj2.op = "SELECT";
                obj2.targetType = "CdmResource";
                obj2.properties = ["id","name"];
                obj2.where = new Object();
                obj2.where.tenantId = tenantId;
                obj2.where.name = new Object();
                obj2.where.name.$regex = '/tasklets/' + taskletId + '/*';

                session.directive([obj1,obj2],onGetResources);
            }
            else
            {
                console.log("No CdmUser found!");
                process.exit(1);
            }
        }
        else
        {
            console.log(resultObject.status);
            process.exit(1);
        }
    }
    else
    {
        console.log("Not a RestResponse?");
        process.exit(1);
    }
}

function onGetResources(err,resultObject)
{
    if (resultObject.length == 2)
    {
        var ro1 = resultObject[0];
        var ro2 = resultObject[1];

        if (ro1.targetType == 'RestResponse')
        {
            if (ro1.status == 'SUCCESS')
            {
                if (ro1.results.length == 1)
                {
                    cdmTasklet = ro1.results[0];
                }
                else
                {
                    console.log("No CdmTasklet found for taskletId '" + taskletId + "' in tenant '" + tenantName + "' (" + tenantId + ")");
                    ""
                }
            }
            else
            {
                console.log(ro1.status);
                process.exit(1);
            }
        }
        else
        {
            console.log("Not a RestResponse?");
            process.exit(1);
        }

        if (ro2.targetType == 'RestResponse')
        {
            if (ro2.status == 'SUCCESS')
            {
                if (ro2.results && (ro2.results.length > 0))
                {
                    cdmResources = ro2.results;
                }
                else
                {
                    console.log("No CdmResources found for taskletId '" + taskletId + "' in tenant '" + tenantName + "' (" + tenantId + ")");
                }
            }
            else
            {
                console.log(ro2.status);
                process.exit(1);
            }
        }
        else
        {
            console.log("Not a RestResponse?");
            process.exit(1);
        }

        //
        //  Now we can delete the CdmTasklet and the CdmResources
        //
        var ops = new Array();
        var obj = null;

        if (cdmTasklet)
        {
            //
            //  We must delete the CdmTasklet indirectly using the "deleteTasklet"
            //  operation because it does something we can't; it deletes the CdmTasklet
            //  and then removes any mention of it from all the CdmProfiles.
            //
            obj = new Object();
            obj.op = "INVOKE";
            obj.targetType = "CdmTasklet";
            obj.name = "deleteTasklet";
            obj.params = new Object();
            obj.params.taskletId = cdmTasklet.taskletId;
            ops.push(obj);
        }

        if (cdmResources && (cdmResources.length > 0))
        {
            for (var i=0; i<cdmResources.length; i++)
            {
                var cdmResource = cdmResources[i];
                var obj = new Object();
                obj.op = "DELETE";
                obj.targetType = "CdmResource";
                obj.where = new Object();
                obj.where.id = cdmResource.id;
                ops.push(obj);
            }
        }

        if (obj)
        {
            session.directive(ops,onDeleteComplete);
        }
        else
        {
            console.log("Nothing to delete");
            process.exit(0);
        }
    }
}

function onDeleteComplete(err,resultObject)
{
    var firstResourceFound = false;

    for (var i=0; i<resultObject.length; i++)
    {
        var restResponse = resultObject[i];

        if (restResponse.targetType == 'RestResponse')
        {
            var rIndex;

            if (cdmTasklet)
            {
                rIndex = i-1;
            }
            else
            {
                rIndex = i;
            }

            //
            //  If we tried to delete the CdmTasklet then the first item is the response
            //  to the "deleteTasklet" operation.
            //
            if (cdmTasklet && (i == 0))
            {
                if (restResponse.status == 'SUCCESS')
                {
                    console.log("CdmTasklet '" + cdmTasklet.taskletId + "' was deleted from tenant '" + tenantName + "' (" + tenantId + ")");
                }
                else
                {
                    console.log("CdmTasklet '" + cdmTasklet.taskletId + "' WAS NOT deleted from tenant '" + tenantName + "' (" + tenantId + ")");
                }
            }
            else
            {
                var cdmResource = cdmResources[rIndex];

                if (!firstResourceFound)
                {
                    firstResourceFound = true;

                    console.log(cdmResources.length + " CdmResources found in tenant '" + tenantName + "' (" + tenantId + ")");
                }

                if (restResponse.status == 'SUCCESS')
                {
                    console.log(" Deleted CdmResource '" + cdmResource.name + "'");
                }
                else
                {
                    console.log(" CdmResource '" + cdmResource.name + "' WAS NOT deleted");
                }
            }
        }
        else
        {
            console.log("Item " + i + " was not a RestResponse");
        }
    }
}
