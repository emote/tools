"use strict";
//
//
//	This is standard jQuery idiom; it gets called after the DOM tree has been created
//
$(document).ready(CDF_Initialize);

function CDF_Ready()
{ 
    //
    //  Declare whether or not this application would benefit from data caching
    //
    FW.allowDataCaching = false;

    //
    //  This parameter will be supplied by the MMC; it will be the "instance name" of the external system
    //
    if (FW.queryHash["xsName"])
    {
        DM.externalSystemName = FW.queryHash["xsName"];

        //
        //  Decode the system name if necessary
        //
        if (DM.externalSystemName.charAt(0) == "_")
        {
            DM.externalSystemName = FW.decodeString(DM.externalSystemName);
        }
    }
    else
    {
        FW.alertAndExit("This 'xsName' parameter is missing so this application cannot be launched.");
        return;
    }

    //
    //  This parameter will be supplied by the MMC; it will be the "type" of the external system (probably 'SFDC' in this case)
    //
    if (FW.queryHash["xsType"])
    {
        DM.externalSystemType = FW.queryHash["xsType"];
    }
    else
    {
        FW.alertAndExit("This 'xsType' parameter is missing so this application cannot be launched.");
        return;
    }

    //
    //  These are the queries we will need to begin the application (and the DM.* variable which will contain the result).
    //
    var requestedQueries = new Array(); 
    requestedQueries.push(new DeclareDataValueObject("DM.credentials","ArrayOfCdmExternalCredentials"));    
    requestedQueries.push(new DeclareDataValueObject("DM.credential","CdmExternalCredentials"));    

    requestedQueries.push(new QueryRequestObject({op:"SELECT", targetType:"CdmExternalSystem",where:{typeName:DM.externalSystemType,name:DM.externalSystemName}}, "DM.allExternalSystems"));
    requestedQueries.push(new QueryRequestObject({op:"SELECT", targetType:"CdmExternalCredentials",where:{username: FW.getUsername(), externalSystem:DM.externalSystemName}}, "DM.allCredentials", "DM.allCredentialsHash", {"extraHashKey":"externalSystem"} ));
    requestedQueries.push(new QueryRequestObject({op:"SELECT", targetType:"CdmTasklet",where:{extSysType:DM.externalSystemType,extSysName:DM.externalSystemName}}, "DM.allApps"));

    //
    //  Initialize the Framework; this will activate the Element-to-Data bindings and run the requested
    //  queries (for data and metadata). This is data we need before the first page can be displayed.
    //
    FW.submitToServer(onRequestDataReady, requestedQueries);    

    //
    // Declare an event handler to fire before the #SelectTask page is about to be shown.
    //
    $('#Loading').bind('pagebeforeshow', function(event)
        {
            FW.setHeaderTitle("Loading...");
            
        });
    
    //
    // Declare an event handler to fire before the #SelectRelated page is about to be shown.
    //
    $('#MainPage').bind('pagebeforeshow', function(event)
        {
            if (DM.externalSystemName)
            {
                FW.setHeaderTitle(DM.externalSystemName);
            }
            else
            {
                FW.setHeaderTitle("Salesforce");
            }
        });     
}

function onRequestDataReady()
{
    if (DM.allApps.length == 0)
    {
        FW.alertAndExit("The matching CdmTasklet object is not defined.");
    }
    else if (DM.allApps.length > 1)
    {
        FW.alertAndExit("There were " + DM.allApps.length + " matching instance of CdmTasklet object found.");
    }
    else
    {
        DM.app = DM.allApps[0];
    }

    if (DM.allExternalSystems.length == 0)
    {
        FW.alertAndExit("The '" + DM.externalSystemName + "' external system is not defined.");
    }
    else if (DM.allExternalSystems.length > 1)
    {
        FW.alertAndExit("There were " + DM.allExternalSystems.length + " instances of the '" + DM.externalSystemName + "' external system defined.");
    }
    else
    {
        DM.externalSystem = DM.allExternalSystems[0];

        var credential = DM.allCredentialsHash[DM.externalSystemName];

        //
        //  There was no credential for this external system
        //  so we will create an empty one. Mark it as "requiresInsert"
        //  so we will know to INSERT it instead of UPDATE it if
        //  the user changes it.
        //
        if (credential == null)
        {
            credential = new Object();
            credential.externalSystem = DM.externalSystemName;
            credential.username = FW.getUsername();
            credential.externalUsername = "";
            credential.externalPassword = "";
            credential.externalToken = "";
            credential.requiresInsert = true;
            credential.validationState = 0;
        }

        credential.hidePassword = true;

        DM.set("DM.credential",credential);

        hidePasswordChanged();

        FW.cloneObject(credential);

        updateValidationState();

        FW.changePage("#MainPage");       
    }
}

function hidePasswordChanged()
{
    if ($("#hidePassword").attr('checked'))
    {
        $("#password").show();
        $("#visiblePassword").hide();

        $("#token").show();
        $("#visibleToken").hide();
    }
    else
    {
        $("#password").hide();
        $("#visiblePassword").show();

        $("#token").hide();
        $("#visibleToken").show();
    }
}

function updateValidationState()
{
    $("#validationState").empty();
    if (DM.credential.validationState == -2)
    {
        $("#validationState").append('<span style="color:#ff0000">The current credentials have expired.</span>');
    }
    else if (DM.credential.validationState == -20)
    {
        $("#validationState").append('<span style="color:#ff0000">Could not find target system.</span>');
    }
    else if (DM.credential.validationState == -30)
    {
        $("#validationState").append('<span style="color:#ff0000">Unable to contact service.</span>');
    }
    else if (DM.credential.validationState < 0)
    {
        $("#validationState").append('<span style="color:#ff0000">The current credentials are invalid.</span>');
    }
    else if (DM.credential.validationState > 0)
    {
        $("#validationState").append('<span style="font-color:#000000">The current credentials are valid.</span>');
    }
    else
    {
        $("#validationState").append('<span style="font-color:#888888">No credentials have been set.</span>');
    }


}

function updateCredentials()
{
    var obj;

    FW.compareClone(DM.credential);

    if (DM.credential.ISMODIFIED)
    {
        DM.set("DM.credential.externalUsername",DM.credential.externalUsername.trim());
        DM.set("DM.credential.externalPassword",DM.credential.externalPassword.trim());
        DM.set("DM.credential.externalToken",DM.credential.externalToken.trim());

        FW.cloneObject(DM.credential);

        if (DM.credential.externalUsername.length == 0)
        {
            FW.alert("Username may not be empty");
            return;
        }

        if (DM.credential.externalPassword.length == 0)
        {
            FW.alert("Password may not be empty");
            return;
        }

        if (DM.credential.externalToken.length == 0)
        {
            FW.alert("Token may not be empty");
            return;
        }

        var obj = new Object();
        obj.op = "INVOKE";
        obj.targetType = "CdmExternalSystem";
        obj.name = "updateExternalCredentials";
        obj.params = new Object();
        obj.params.externalSystem = DM.credential.externalSystem;
        obj.params.username = DM.credential.externalUsername;
        obj.params.password = DM.credential.externalPassword;
        obj.params.token = DM.credential.externalToken;

        FW.submitToServer(function(requestArray)
        {
            var restResponse = null;

            if (requestArray[0].restResponse && requestArray[0].restResponse.targetType == "RestResponse")
            {
                restResponse = requestArray[0].restResponse;
            }

            if (restResponse)
            {
                if (restResponse.status == "SUCCESS")
                {
                    var cdmStatus = restResponse.results;
                    DM.credential.validationState = cdmStatus.validationState;

                    updateValidationState();

                    //
                    //  The changes were saved, but they are known to be invalid
                    //
                    if (DM.credential.validationState <= 0)
                    {

                        FW.alert("The credentials have been updated but are NOT valid.");
                    }
                    //
                    //  The changes were saved and are known to be valid.
                    //
                    else
                    {
                        FW.alertAndExit("The credentials have been updated and are valid.",EXIT_APPLICATION_TO_CREDENTIAL_SETTINGS);
                    }
                }
                else
                {
                    FW.terminateOnRestResponseError(JSON.stringify(obj),restResponse,"Error in 'updateExternalCredentials'");
                }
            }
             else
            {
                FW.terminateOnImpossible("No RestResponse returned from 'updateExternalCredentials'");
            }

        },
        [new NonQueryRequestObject(obj)]);
    }
    else
    {
        FW.alert("No credentials were changed");
    }

}




