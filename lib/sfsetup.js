"use strict";
var async = require('async');
var fs = require('fs');
var util = require('util');
var prompt = require('prompt');
var httpRequest = require('emsoap').subsystems.httpRequest;

var common = require('./common');
var mms = require('./mms');
var mmscmd = require('./mmscmd');

var session; // MMS session

var externalSystemType = 'NODEX';
var externalSystem;
var accessAddress;
var credentials;
var mappedObjects;
var sobjectsUrl;
var salesforceCreds;


var verboseLoggingForExternalSystem;

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

function afterAuth(cb) {
    session.directive({
        op:'SELECT',
        targetType:'CdmExternalCredentials',
        where:{
            username:common.global.session.creds.username,
            externalSystem:externalSystem
        }
    }, function (err, result) {
        if (err) {
            return cb(err);
        }
        //console.dir(result);
        salesforceCreds = result.results[0];
        var sfUrl = salesforceCreds.oauthCredentials.oauthRawResponse.id;
        var options = createHttpOptions(sfUrl, salesforceCreds);
        httpRequest.httpRequest(options, null, function (err, result) {
                if (err) {
                    return cb(err);
                }
                try {
                    var sfUrlInfo = JSON.parse(result.body);
                }
                catch (ex) {
                    console.log("Unexpected response from Salesforce: ");
                    console.log(result.body);
                    return cb(new Error("Unexpected Salesforce error"));
                }
                sobjectsUrl = sfUrlInfo.urls.sobjects.replace('{version}', credentials.sfVersion);
                createMappedCustomObjects(cb)
            }
        )

    });
}

exports.deployModel = function deployModel(externalSystemName,mmsSession,cb) {
    session = mmsSession;
    externalSystem = externalSystemName;
    var text;

    if(!session.creds.externalCredentials) {
        console.log("Profile must include externalCredentials");
        process.exit(1);
    }

    credentials = session.creds.externalCredentials[externalSystemName];
    if(!credentials) {
        console.log("Profile does not provide externalCredentials for " + externalSystemName);
        process.exit(1);
    }

    if(!credentials.oauthKey || !credentials.oauthSecret) {
        console.log("externalSystemName for " + externalSystemName + " must contain the oAuth key and secret.");
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

    if(mappedObjects._verbose_logging_) {
        verboseLoggingForExternalSystem = mappedObjects._verbose_logging_;
    }
    delete mappedObjects._verbose_logging_;


    createExternalSystem(function(err) {
        if (err) {
            return cb(err);
        }
        var addr = common.global.session.creds.server + "/oauth/" + externalSystem + "/authenticate";

        if (common.global.argv.nonInteractive) {
            console.log("Note: what follows will fail unless Emotive has been authorized at " + addr);
            afterAuth(cb);
        }
        else {
            console.log("Please navigate to " + addr.underline + " with your browser");
            prompt.start();
            prompt.colors = false;
            prompt.message = 'Press Enter when done';
            prompt.delimiter = '';
            var props = {
                properties: {
                    q: {
                        description : ":"
                    }
                }
            }
            prompt.get(props, function (err, result) {
                if (err) {
                    return cb(err);
                }
                afterAuth(cb);
            });
        }
    });
}


function createExternalSystem(cb) {

    if (!session.creds.username)
    {
        console.log("session.creds.username was null");
        process.exit(1);
    }

    if(verboseLoggingForExternalSystem) console.log('VERBOSE LOGGING IS ON FOR ' + externalSystem);

    session.directive({
            op: 'INVOKE',
            targetType: 'CdmExternalSystem',
            name: "updateOAuthExternalSystem",
            params: {
                name: externalSystem,
                typeName: externalSystemType,
                "oauthCredentials" : {
                    "oauthType": "salesforce",
                    "oauthKey": credentials.oauthKey,
                    "oauthSecret": credentials.oauthSecret
                },
                properties: {
                    proxyConfiguration: {verbose: verboseLoggingForExternalSystem, sfVersion: credentials.sfVersion}
                }
            }
        },
        cb);
}

function createMappedCustomObjects(cb) {
    var typeMap = mappedObjects 

    var options = createHttpOptions(sobjectsUrl, salesforceCreds);
    httpRequest.httpRequest(options, null, function(err, result) {
        if(err) {
            console.log("Error getting list of Saleforce objects: " + err);
            process.exit(1);
        }

        try {
            var sobjects = JSON.parse(result.body).sobjects;
        }
        catch(ex) {
            console.log('Unexpected reply from Salesforce sobjects/ ');
            console.dir(result);
            return cb(new Error('Unexpected reply from Salesforce sobjects/ '));
        }

        var salesforceTypeMap = {};
        var arr = [];
        sobjects.forEach(function(basicInfo) {
            salesforceTypeMap[basicInfo.name] = true;
            // Look for the target type in the typeMap
            var foundType = typeMap[basicInfo.name];
            if(foundType) {
                arr.push({basicInfo:basicInfo,foundType:foundType});
            }
        });

        // Find targetTypes that do not match Salesforce types and warn user
        for(var typeName in typeMap) {
            if(!salesforceTypeMap[typeName]) {
                console.log('WARNING: target type ' + typeName + ' was not found in your Salesforce metadata.' +
                    ' It will not be included in you generated CDM types.');
            }
        }

        async.forEachSeries(arr,getBasicInfo, cb);

    });
}

function getBasicInfo(item,cb) {
    var url = item.basicInfo.urls['describe'];
    var baseUrl = sobjectsUrl.replace(/\/services.*/, "");
    httpRequest.httpRequest(createHttpOptions(baseUrl + url, salesforceCreds), null, function(err, result) {
        if(err) {
            console.log("Error getting decription of Salesforce object: " + err);
            process.exit(1);
        }
        processSalesforceType(JSON.parse(result.body),item.foundType,cb);
    });
}

function processSalesforceType(result,typeSubset,cb) { 

    var propList = [];
    var targetProperties = [];
    var pickListTypes = [];
    
    common.verbose('Salesforce Metadata for ' + result.name);
    // + ' : ' + util.inspect(result,false,null));
 
    var attributes = result.fields;
    var attrMap = {};

    attributes.forEach(function(attr) {
        attrMap[attr.name] = true;

        if(!typeSubset.properties  
        || typeSubset.properties[attr.name] 
        || attr.name == "Id" 
        || attr.name == "SystemModstamp" 
        || attr.name == "CreatedDate" 
        || attr.name == "CreatedById") 
        {
            // if a property list is supplied, check to see if this property occurs in the list

            var cdmType;
            var propertyInfo = typeSubset.properties[attr.name];
            if(propertyInfo && propertyInfo.type) {
                cdmType = propertyInfo.type;
            } else {
                cdmType = salesforceTypeMap[attr.type.toUpperCase()];
            }
            if(!cdmType) cdmType = 'String';

            common.verbose('\t' + attr.name + ' : ' + attr.type + ' maps to ' + cdmType);

            if(attr.picklistValues && attr.picklistValues.length > 0) {
                // If this is a picklist, then we create a cdmType to hold the enumeration

                var enumurationTypeName = typeSubset.target + '_enum_' + attr.name;
                var enumeration = [];
                attr.picklistValues.forEach(function(row) {
                    enumeration.push({label:row.label,value:row.value});
                });
                //console.dir(enumeration);
                pickListTypes.push({enumurationTypeName:enumurationTypeName,enumeration:enumeration});

                if (attr.type == "picklist")
                {
                    cdmType = enumurationTypeName;
                }
            }

            if (attr.name != "Id")
            {
                propList.push({name: attr.name, type: cdmType});
            }

            targetProperties.push({name: attr.name, type: cdmType, externalType: attr.type});
        }
    });

    if(typeSubset.properties) {
        for(var propName in typeSubset.properties) {
            if(!attrMap[propName]) {
                console.log('WARNING: property ' + propName + ' was not found in your Salesforce metadata.' +
                    ' It will not be included in the generated CDM type: ' + typeSubset.target);
            }
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

    var  myTypeName = typeSubset.target;
    updateCdmType(myTypeName,propList,function(){
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

    async.series([
        function(cb) {
            mmscmd.remove(session,'CdmTargetType',{name: sfdcName, externalSystem: externalSystem},cb);
        },
        function(cb) {
            mmscmd.remove(session,'CdmTypeBinding',{name: cdmName, externalSchema: externalSystem},cb);
        },
        function(cb) {
            mmscmd.remove(session,'CdmPropertyBinding',{cdmType: cdmName, externalSchema: externalSystem},cb);
        },
        function(cb) {
            session.directive({
                op: 'INSERT',
                targetType: 'CdmTargetType',
                values: {
                    name: sfdcName,
                    externalSystem: externalSystem,
                    properties: propList
                }
            },cb);
        },
        function(cb) {
            var condition = typeSubset.initialCondition;
            var cacheMode = typeSubset.cacheMode || 'query'; // default to cacheMode query

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
                    cacheMode: cacheMode, 
                    sourceStrategy: 'sync', 
                    writeStrategy: 'sync', 
                    uniqueExternalId: true,
                    initialCondition: (condition ? JSON.stringify(condition) : null)
                }
            },cb);
        },
        function(cb) {
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
                    externalSchema: externalSystem
                });
            }

            async.forEachSeries(propertyBindingList,function(item,cb2) {
                console.log('creating CdmPropertyBinding ' + item.cdmProperty + ' ' + item.externalProperty);
                session.directive({
                    op: 'INSERT',
                    targetType: 'CdmPropertyBinding', 
                    values: {
                        cdmType: item.cdmType, 
                        cdmProperty: item.cdmProperty, 
                        externalType: item.externalType, 
                        externalProperty: item.externalProperty, 
                        externalSchema: item.externalSchema
                    }
                },cb2);
            },cb);
        }
    ],   
    function(err) {
        if(err) {
            console.log('Encountered error while binding CDM type: ' + err);
            console.log('Cleaning external system ' + externalSystem + ' is recommended.');
            process.exit(1);
        } else {
            console.log('Completed binding of CDM type: ' + cdmName)
        }
        callback(err);
    });  
}

function updateCdmType(typeName,properties,callback) { 
    session.directive({
        op: 'INVOKE',
        targetType: 'CdmType',
        name: 'alterCdmType',
        params: {
            replace: true,
            typeName: typeName, 
            storage: 'document',
            extensionAllowed: true, 
            externallySourced: true,
            propertySet: properties,
            indices: [[
                {property: 'externalId', order: 1}, 
                {options: {unique: false}}
            ]]
        }
    },callback);
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

    var encodedQuery = encodeURIComponent(query);
    var queryUrl = sobjectsUrl.replace("sobjects", "query");
    httpRequest.httpRequest(createHttpOptions(queryUrl + '?q=' + encodedQuery, salesforceCreds), null, function(err, result) {
        if(err) {
            console.log('Error from query for enumeration: ' + query);
            console.log(err);
            process.exit(1);
        }

        var records = JSON.parse(result.body).records;

        if(!records) {
            console.log('Unexpected reply from Salesforce query: ' + query);
            console.dir(selectResult);
            return;
        }

        var enumeration = [];
        records.forEach(function(row) {
            var item = {
                label:row[props.label],
                value:row[props.value]
            };
            item.extraData = {};
            for(var name in props.extraData) {
                item.extraData[name] = row[props.extraData[name]];
            }
            enumeration.push(item);
        });

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
                scalarBaseType: 'String',
                scalarInheritsFrom : 'String',
                isEnumerated: 'true',
                isScalar: true,
                overrideAllowed: true,
                enumeration: enumeration,
                indices: []
            }
        },callback);
    });
}

function createHttpOptions(url, sfcreds) {
    var options = httpRequest.parseUrl(url);
    options.headers = {
        Authorization: "Bearer " +  sfcreds.oauthCredentials.oauthAccessToken
    };

    return options;
}
