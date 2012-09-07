"use strict";
var async = require('async');
var fs = require('fs');
var util = require('util');

var mms = require('./mms');
var sforce = require('./sforce');

var sfSession; // saleforce session
var session; // MMS session

var externalSystemType = 'SFDC';
var externalSystem;
var accessAddress;
var credentials;
var mappedObjects;
var finalCallback;

/*
exports.objectsArg = argv.objects;
exports.mediaArg = argv.media;
exports.externalSystemName = argv.externalSystemName;
*/
var settings = new Object();
exports.settings = settings;

var verbose = false;
settings.verbose = verbose;
mms.settings.verbose = verbose;
sforce.settings.verbose = verbose;


var salesforceTypeMap = {
    'STRING':'String',
    'BOOLEAN':'Boolean',
    'INT':'Integer',
    'DOUBLE':'Real',
    'DATE':'DateString',
    'DATETIME':'Date',
    'BASE64':'String',
    'ID':'String',
    'REFERENCE':'String',
    'CURRENCY':'Dollars',
    'TEXTAREA':'String',
    'PERCENT':'Percent',
    'PHONE':'String',
    'URL':'String',
    'EMAIL':'String',
    'COMBOBOX':'String',
    'PICKLIST':'String',
    'MULTIPICKLIST':'String',
    'ANYTYPE':'String'
};

exports.deployModel = function deployModel(externalSystemName,mmsSession,cb) {
    finalCallback = cb;
    session = mmsSession;
    externalSystem = externalSystemName;
    var text; 

    try {
        text = fs.readFileSync("creds.json");
    } catch(err) {
        console.log('Error reading file creds.json:' + err);
        process.exit(1);
    }
    try {
        credentials = JSON.parse(text);
    } catch(err) {
        console.log('Error parsing JSON in creds.json:' + err);
        process.exit(1);
    }
    if(!credentials.host) {
        console.log("Credentials file: " + argv.credentials + " must contain the Salesforce host string.");
        process.exit(1);
    }
    accessAddress = credentials.host;

    try {
        text = fs.readFileSync("salesforce.json");
    } catch(err) {
        console.log('Error reading file salesforce.json:' + err);
        process.exit(1);
    }
    try {
        mappedObjects = JSON.parse(text);
    } catch(err) {
        console.log('Error parsing JSON in salesforce.json:' + err);
        process.exit(1);
    }

    sfSession = new sforce.Session(credentials);
    console.log("LOGGING INTO Salesforce...")
    //console.dir(credentials);
    sfSession.login(createExternalSystem); 
}


function createExternalSystem(err) {

    if(err) {
        console.dir(err);
        process.exit(1);
    }

    //console.log('INSERT STATUS:');

    session.directive({
        op: 'INSERT',
        targetType: 'CdmExternalSystem', 
        values: {
            name: externalSystem,
            typeName: externalSystemType,
            accessAddress: accessAddress,
        }

    },function() {

        //console.log('inserting credentials for username=' + session.username);

        session.directive({
            op: 'INSERT',
            targetType: 'CdmExternalCredentials', 
            values: {
                externalUsername: credentials.username,
                externalPassword: credentials.password,
                externalToken: credentials.token,
                externalSystem: externalSystem,
                validationState : 1,
                username: session.username,
            }
        },createMappedCustomObjects);

    });
}

function createMappedCustomObjects() {
    var typeMap = mappedObjects 

    sfSession.restRequest('GET','sobjects/',null,function scanSObjects(err,status,result) {

        if(!result.sobjects) {
            console.log(status + ' Unexpected reply from Salesforce sobjects/ ');
            console.dir(result);
            return;
        }

        var arr = [];
        for (var i=0; i < result.sobjects.length; i++) {
            var basicInfo = result.sobjects[i];

            // Look for the target type in the typeMap
            var foundType = typeMap[basicInfo.name];
            if(foundType) {
                arr.push({basicInfo:basicInfo,foundType:foundType});
            }
        }

        async.forEachSeries(arr,getBasicInfo,finalCallback);

    });
}

function getBasicInfo(item,cb) {
    sfSession.restRequest('GET',item.basicInfo.urls['describe'],null,function createCdmTargetType(err,status,result) {
        processSalesforceType(result,item.foundType,cb);
    });
}

function processSalesforceType(result,typeSubset,cb) { 

    var propList = [];
    var targetProperties = [];
    var pickListTypes = [];
    
    console.log('Salesforce Metadata for: ' + result.name);
    //console.dir(result);
 
    var attributes = result.fields;
    if(settings.verbose) console.log(result.name);
    for (var i=0; i < attributes.length; i++) {
        var attr = attributes[i];

        if(!typeSubset.properties || typeSubset.properties[attr.name] 
        || attr.name == "Id" || attr.name == "SystemModstamp" || attr.name == "CreatedDate" || attr.name == "CreatedById") {
            // if a property list is supplied, check to see if this property occurs in the list

            var cdmType;
            var propertyInfo = typeSubset.properties[attr.name];
            if(propertyInfo && propertyInfo.type) {
                cdmType = propertyInfo.type;
            } else {
                cdmType = salesforceTypeMap[attr.type.toUpperCase()];
            }
            if(!cdmType) cdmType = 'String';
            if(settings.verbose) console.log('\t' + attr.name + ' : ' + attr.type + ' maps to ' + cdmType);

            if(attr.picklistValues && attr.picklistValues.length > 0) {
                // If this is a picklist, then we create a cdmType to hold the enumeration

                var enumurationTypeName = result.name + '_enum_' + attr.name;
                var enumeration = [];
                for(var j=0;j<attr.picklistValues.length;j++) {
                    var row = attr.picklistValues[j];
                    var item = new Object();
                    enumeration.push(item);
                    item.label = row.label;
                    item.value = row.value;
                }
                //console.dir(enumeration);
                pickListTypes.push({enumurationTypeName:enumurationTypeName,enumeration:enumeration});

                if (attr.type == "picklist")
                {
                    cdmType = enumurationTypeName;
                }
            }

            propList.push({name: attr.name, type: cdmType});
            targetProperties.push({name: attr.name, type: cdmType, externalType: attr.type});
        }
    }

    async.forEachSeries(pickListTypes,
        function(item,cb) {
            replaceEnumeration(item.enumurationTypeName,item.enumeration,function(){
                // console.log('replaceEnumeration completed.')
                cb();
            });
        },
        function() {
            processSalesforceTypeContinued(result,typeSubset,propList,targetProperties,cb);
        }
    );
}

function processSalesforceTypeContinued(result,typeSubset,propList,targetProperties,cb) { 

    var  myTypeName = result.name
    replaceCdmType(myTypeName,propList,function(){
        console.log('Created type: ' + myTypeName);
        createBinding(myTypeName,result.name,targetProperties,typeSubset,function(err){
            console.log('createBinding completed.');

            if(myTypeName === 'Opportunity') {
                // Default SFDC Opportunity object requires special handling of enumerated StageName:

                addEnumeration('Opportunity_enum_StageName','OpportunityStage',
                    {label:'MasterLabel',value:'MasterLabel',extraData:{
                        DefaultProbability:'DefaultProbability',
                        IsClosed:'IsClosed',
                        IsWon:'IsWon',
                        IsActive:'IsActive',
                        SortOrder:'SortOrder'}},
                    function(err) {
                        console.log("Created Opportunity_enum_StageName.");
                        cb(err);
                    });

            } else if(myTypeName === 'Task') {
                // Default SFDC Task object requires special handling of enumerated TaskStatus:

                addEnumeration('Task_enum_Status','TaskStatus',
                        {label:'MasterLabel',value:'MasterLabel',extraData:{IsClosed:'IsClosed'}},
                    function(err) {
                        console.log("Created Task_enum_Status.");
                        cb(err);
                    });

            } else {
                cb(err);
            }

        });
    });

}

function createBinding(cdmName,sfdcName,propList,typeSubset,callback) { 

    session.directive({
        op: 'INSERT',
        targetType: 'CdmTargetType',
        values: {
            name: sfdcName,
            externalSystem: externalSystem,
            properties: propList
        }
    },function() {

        var condition = typeSubset.initialCondition;

        console.log('creating CdmTypeBinding ' + cdmName + ' to ' + sfdcName);

        session.directive({
            op: 'INSERT',
            targetType: 'CdmTypeBinding', 
            values: {
                name: cdmName, 
                externalType: sfdcName, 
                externalSchema: externalSystem, 
                readStrategy: 'sync', 
                readPeriod: null,
                cacheMode: 'global', 
                sourceStrategy: 'sync', 
                writeStrategy: 'sync', 
                uniqueExternalId: true,
                initialCondition: (condition ? JSON.stringify(condition) : null),  
            }
        },function() {

            // first determine if this is a field that does not have a SystemModstamp,
            // (e.g. OpportunityFieldHistory) -- if there is not SystemModstamp, then
            // the CDM externalTimestamp field must map to the SFDC CreatedDate field
            var hasSystemModstamp = false;
            for(var j=0;j<propList.length;j++) {
                var bindProp = propList[j];
                if(bindProp.name === 'SystemModstamp') {
                    hasSystemModstamp = true;
                    break;
                }
            }

            // propList is: [{name: attr.name, type: cdmType, externalType: attr.type},...]
            var propertyBindingList = [];

            for(var j=0;j<propList.length;j++) {
                var bindProp = propList[j];

                var cdmProp = bindProp.name; // default to SFDC name
                var propType = bindProp.externalType;
                if(bindProp.name === 'Id') {
                    cdmProp = 'externalId';
                    propType = 'string';
                } else if(bindProp.name === 'SystemModstamp') {
                    cdmProp = 'externalTimestamp';
                    propType = 'datetime';
                } else if(!hasSystemModstamp && bindProp.name === 'CreatedDate') {
                    cdmProp = 'externalTimestamp';
                    propType = 'datetime';
                }
                //console.log("Adding Binding for " + sfdcName + "." + bindProp.name)

                propertyBindingList.push({
                    cdmType: cdmName, 
                    cdmProperty: cdmProp, 
                    externalType: sfdcName, 
                    externalProperty: bindProp.name, 
                    externalSchema: externalSystem, 
                });
            }

            async.forEachSeries(propertyBindingList,
                function(item,cb) {
                    console.log('creating CdmPropertyBinding ' + item.cdmProperty + ' ' + item.externalProperty);
                    session.directive({
                        op: 'INSERT',
                        targetType: 'CdmPropertyBinding', 
                        values: {
                            cdmType: item.cdmType, 
                            cdmProperty: item.cdmProperty, 
                            externalType: item.externalType, 
                            externalProperty: item.externalProperty, 
                            externalSchema: item.externalSchema, 
                        }
                    },cb);
                },
                callback
            );
         });
    });

}

function replaceCdmType(typeName,properties,callback) { 
    //console.log('Replacing CdmType ' + typeName + ' properties:');
    //console.dir(properties);

    session.directive({
        op: 'INVOKE',
        targetType: 'CdmType',
        name: 'deleteCdmType',
        params: {typeName: typeName}
    },'rest.target.type.does.not.exist',function(deleteResult) {

        session.directive({
            op: 'INVOKE',
            targetType: 'CdmType',
            name: 'createCdmType',
            params: {
                typeName: typeName, 
                storage: 'document',
                extensionAllowed: true, 
                externallySourced: true,
                propertySet: properties,
                indices: [[{property: 'externalId', order: 1}, {property: 'tenantId', order: 2}, {options: {unique: true}}]]
            },
        },callback);
    });
}

function addEnumeration(typeName,externalTypeName,props,callback) {
// Adds or replaces a CDM enumeration based on a table in Saleforce

    var sfProps = new Object();
    sfProps[props.label] = true;
    sfProps[props.value] = true;
    for(var name in props.extraData) {
        sfProps[props.extraData[name]] = true;
    }
    var query = 'SELECT ';
    for(var name in sfProps) {
        if(query!='SELECT ') query += ',';
        query += name;
    }
    query += ' FROM ' + externalTypeName;

    console.log('Query for enumeration: ' + query);

    sfSession.restRequest('GET','query/?q=' + encodeURIComponent(query),null,function(err,status,selectResult) {
        if(!selectResult.records) {
            console.log(status + ' Unexpected reply from Salesforce query: ' + query);
            console.dir(selectResult);
            return;
        }

        var enumeration = [];
        for(var i=0;i<selectResult.records.length;i++) {
            var row = selectResult.records[i];
            var item = new Object();
            enumeration.push(item);
            item.label = row[props.label];
            item.value = row[props.value];
            item.extraData = new Object();
            for(var name in props.extraData) {
                item.extraData[name] = row[props.extraData[name]];
            }
        }

        replaceEnumeration(typeName,enumeration,callback);
    });
}

function replaceEnumeration(typeName,enumeration,callback) { 
    session.directive({
        op: 'INVOKE',
        targetType: 'CdmType',
        name: 'deleteCdmType',
        params: {typeName: typeName}
    },'rest.target.type.does.not.exist',function(deleteResult) {

        //mms.reportSuccess(deleteResult);
        console.log('Creating new type: ' + typeName);

        session.directive({
            op: 'INVOKE',
            targetType: 'CdmType',
            name: 'createCdmType',
            params: {
                typeName: typeName, 
                storage: 'scalar', 
                propertySet: [{name : "id", type : "Integer"}],
                scalarBaseType: 'String',
                scalarInheritsFrom : 'String',
                isEnumerated: 'true',
                isScalar: true,
                overrideAllowed: true,
                enumeration: enumeration,
                indices: [],
            }
        },callback);
    });
}           
