"use strict";
var fs = require('fs');
var path = require('path');
var util = require('util');

var opInfo;
var filename;
var functionBody = null;
var finalCallback;
var session; // MMS session
var doDeploy;

exports.deployVirtualOp = function deployVirtualOp(mmsSession,callback)
{
    doVirtualOp(mmsSession,true,callback);
}
exports.undeployVirtualOp = function undeployVirtualOp(mmsSession,callback)
{
    doVirtualOp(mmsSession,false,callback);
}

function doVirtualOp(mmsSession,_deDeploy,callback)
{
    doDeploy = _deDeploy;
    finalCallback = callback;
    session = mmsSession;

    opInfo = JSON.parse(fs.readFileSync('operation.json','utf-8'));
    functionBody = null;

    var ls = fs.readdirSync('.');
    ls.forEach(function(name) {
        var end = name.substring(name.length - 3);
        if(end === '.js') {
            if(functionBody) {
                console.log('More than one .js file in operation is not allowed: ' + opInfo.name);
                process.exit(1);
            } else {
                filename = name;
                functionBody = fs.readFileSync(name, "utf-8");  
            }
        }
    });

    //
    //  Delete the existing operation, if any
    //
    var obj = new Object();
    obj.op = "INVOKE";    
    obj.targetType = "CdmOperation";
    obj.name = "deleteOperation";
    obj.params = new Object(); 
        obj.params.typeName = opInfo.type;
        obj.params.name = opInfo.name;

    session.directive(obj,'rest.operation.does.not.exist',onDeleteOperationComplete);
}

function onDeleteOperationComplete(err,restResponse)
{    
    if (restResponse.status == "SUCCESS")
    {
        console.log('Operation "' + opInfo.name + '" deleted');
    }
    else if (	restResponse.errors
			&& 	(restResponse.errors.length == 1)
			&&	(restResponse.errors[0].errorCode == 'rest.operation.does.not.exist'))
	{
		if (!doDeploy)
        {
            console.log("Operation " + opInfo.name + " was not found");
        }
	}
	else
	{
		console.log('Error deleting operation "' + opInfo.name + '": ' + processRestResponse(restResponse));
	}


    //
    //  Delete the virtual CdmType, if any
    //
    var obj = new Object();
    obj.op = "INVOKE";    
    obj.targetType = "CdmType";
    obj.name = "deleteCdmType";
    obj.params = new Object(); 
        obj.params.typeName = opInfo.type;
    obj.options = new Object();

    //console.log('Deleting type "' + opInfo.type + '...');
    session.directive(obj,'rest.target.type.does.not.exist',onDeleteTypeComplete);

}
function onDeleteTypeComplete(err,restResponse)
{    
    if (restResponse.status == "SUCCESS")
    {
        console.log('CdmType "' + opInfo.type + '" deleted');
    }
    else if (	restResponse.errors
			&& 	(restResponse.errors.length == 1)
			&&	(restResponse.errors[0].errorCode == 'rest.target.type.does.not.exist'))
	{
        if (!doDeploy)
        {
            console.log("CdmType " + opInfo.type + " was not found");
        }
    }
    else
    {
        console.log('Error deleting Type "' + opInfo.type + '": ' +  processRestResponse(restResponse));
    }

    if (!doDeploy)
    {
        finalCallback();
        return;
    }
    var returns;

    if (opInfo.returns && opInfo.returns.splice)
    {
        returns = opInfo.returns;
    }
    else
    {
        returns = new Array();
    }
    
    var ary = new Array();
    var obj;
    
    //
    //  Create the Virtual CdmType
    //
    obj = new Object();
    obj.op = "INVOKE";
 
    obj.targetType = "CdmType";
    obj.name = "createCdmType";
    obj.params = new Object();
        obj.params.typeName = opInfo.type;
        obj.params.storage = "virtual";
        obj.params.externallySourced = false;
        obj.params.sourceStrategy = "sync";
        obj.params.uniqueExternalId = true;
        obj.params.overrideAllowed = true;
        obj.params.multiTypes = returns;
        obj.params.implementingOpName = opInfo.name;

    session.directive(obj,createOperation);

}

function createOperation(err,result) {
    if (result.status == "SUCCESS")
    {
        console.log('CdmType "' + opInfo.type + '" created');
    }
    else
    {
        console.log('Creation of CdmType "' + opInfo.type + '" failed: ' + processRestResponse(result));
        process.exit(1);
    }

    var parameters = new Array();

    var parmsToAddString = opInfo.parameters;
    
    if (parmsToAddString)
    {
        var parmPairsToAdd = parmsToAddString.split(",");
        
        for (var i=0; i<parmPairsToAdd.length; i++)
        {
            var parmPair = parmPairsToAdd[i];
            var nv = parmPair.split(":");
            
            if (nv.length == 2)
            {
                var parmName = nv[0];
                var parmType = nv[1];
                
                parameters.push({name: parmName, typeName: parmType});
            }
            else
            {
                console.error("Parameter pair '" + parmPair + "' is invalid");
            }
        }  
    }

    //
    //  Create the operation
    //
    var obj = new Object();
    obj.op = "INVOKE";
    
    obj.targetType = "CdmOperation";
    obj.name = "createOperation";
    obj.params = new Object(); 
        obj.params.objectType = opInfo.type;
        obj.params.name = opInfo.name;
        obj.params.scriptType = 'javascript';
        obj.params.body = functionBody;
        obj.params.parameters = parameters;

    session.directive(obj,onRegisterComplete);
}

function onRegisterComplete(err,result)
{
    if (result.status == "SUCCESS")
    {
        console.log("Created Virtual Type '" + opInfo.type + "' with Javascript operation '" + opInfo.name + "' from file " + filename);
    }
    else
    {
        console.log('Create operation "' + opInfo.name + '" failed: ' + processRestResponse(result));
    }
    console.log('');

    finalCallback();
}

function processRestResponse(restResponse)
{
    var errorMessage = null;
    
    if (restResponse.errors)
    {       
        for (var i=0; i<restResponse.errors.length; i++)
        {
            var cdmStatus = restResponse.errors[i];
            
            if (errorMessage)
            {
                errorMessage += "\n" + cdmStatus.errorMessage;
            }
            else
            {
                errorMessage = cdmStatus.errorMessage;
            }
            
            if (restResponse.errorCode)
            {
                errorMessage += " (" + restResponse.errorCode + ")";
            }
        }       
    }
    else
    {
        errorMessage = "Return value was not RestResponse: '" + JSON.stringify(restResponse) + "'";
    }
    
    return errorMessage;
}


