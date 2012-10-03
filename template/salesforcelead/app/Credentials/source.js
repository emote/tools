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
    Emotive.App.Collections.allowCaching(false);

    //
    //  Get a hash table containing the query parameters the application was called with.
    //
    var queryHash = Emotive.App.getQueryParameters();

    //
    //  This parameter will be supplied by the MMC; it will be the "instance name" of the external system
    //
    if (queryHash["xsName"])
    {
        Emotive.Data.externalSystemName = queryHash["xsName"];

        //
        //  Decode the system name if necessary
        //
        if (Emotive.Data.externalSystemName.charAt(0) == "_")
        {
            Emotive.Data.externalSystemName = Emotive.Js.Strings.decodeNonAlphanumericString(Emotive.Data.externalSystemName);
        }
    }
    else
    {
        Emotive.Ui.Dialog.alertAndExit("This 'xsName' parameter is missing so this application cannot be launched.");
        return;
    }

    //
    //  This parameter will be supplied by the MMC; it will be the "type" of the external system (probably 'SFDC' in this case)
    //
    if (queryHash["xsType"])
    {
        Emotive.Data.externalSystemType = queryHash["xsType"];
    }
    else
    {
        Emotive.Ui.Dialog.alertAndExit("This 'xsType' parameter is missing so this application cannot be launched.");
        return;
    }

    //
    //  These are the queries we will need to begin the application (and the DM.* variable which will contain the result).
    //
    var requestedQueries = new Array(); 
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.credentials","ArrayOfCdmExternalCredentials"));    
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.credential","CdmExternalCredentials"));    

    requestedQueries.push(new QueryRequestObject({op:"SELECT", targetType:"CdmExternalSystem",where:{typeName:Emotive.Data.externalSystemType,name:Emotive.Data.externalSystemName}}, "Emotive.Data.allExternalSystems"));
    requestedQueries.push(new QueryRequestObject({op:"SELECT", targetType:"CdmExternalCredentials",where:{username: Emotive.User.getName(), externalSystem:Emotive.Data.externalSystemName}}, "Emotive.Data.allCredentials", "Emotive.Data.allCredentialsHash", {"extraHashKey":"externalSystem"} ));
    requestedQueries.push(new QueryRequestObject({op:"SELECT", targetType:"CdmTasklet",where:{extSysType:Emotive.Data.externalSystemType,extSysName:Emotive.Data.externalSystemName}}, "Emotive.Data.allApps"));

    //
    //  Initialize the Framework; this will activate the Element-to-Data bindings and run the requested
    //  queries (for data and metadata). This is data we need before the first page can be displayed.
    //
    Emotive.Service.submit(requestedQueries, onRequestDataReady);

    //
    // Declare an event handler to fire before the #SelectTask page is about to be shown.
    //
    $('#Loading').bind('pagebeforeshow', function(event)
        {
            Emotive.Ui.Header.setTitle("Loading...");
            
        });
    
    //
    // Declare an event handler to fire before the #SelectRelated page is about to be shown.
    //
    $('#MainPage').bind('pagebeforeshow', function(event)
        {
            if (Emotive.Data.externalSystemName)
            {
                Emotive.Ui.Header.setTitle(Emotive.Data.externalSystemName);
            }
            else
            {
                Emotive.Ui.Header.setTitle("Salesforce");
            }
        });     
}

function onRequestDataReady()
{
    if (Emotive.Data.allApps.length == 0)
    {
        Emotive.Ui.Dialog.alertAndExit("The matching CdmTasklet object is not defined.");
    }
    else if (Emotive.Data.allApps.length > 1)
    {
        Emotive.Ui.Dialog.alertAndExit("There were " + Emotive.Data.allApps.length + " matching instance of CdmTasklet object found.");
    }
    else
    {
        Emotive.Data.app = Emotive.Data.allApps[0];
    }

    if (Emotive.Data.allExternalSystems.length == 0)
    {
        Emotive.Ui.Dialog.alertAndExit("The '" + Emotive.Data.externalSystemName + "' external system is not defined.");
    }
    else if (Emotive.Data.allExternalSystems.length > 1)
    {
        Emotive.Ui.Dialog.alertAndExit("There were " + Emotive.Data.allExternalSystems.length + " instances of the '" + Emotive.Data.externalSystemName + "' external system defined.");
    }
    else
    {
        Emotive.Data.externalSystem = Emotive.Data.allExternalSystems[0];

        var credential = Emotive.Data.allCredentialsHash[Emotive.Data.externalSystemName];

        //
        //  There was no credential for this external system
        //  so we will create an empty one. Mark it as "requiresInsert"
        //  so we will know to INSERT it instead of UPDATE it if
        //  the user changes it.
        //
        if (credential == null)
        {
            credential = new Object();
            credential.externalSystem = Emotive.Data.externalSystemName;
            credential.username = Emotive.User.getName();
            credential.externalUsername = "";
            credential.externalPassword = "";
            credential.externalToken = "";
            credential.requiresInsert = true;
            credential.validationState = 0;
        }

        credential.hidePassword = true;

        Emotive.Data.set("Emotive.Data.credential",credential);

        hidePasswordChanged();

        Emotive.Js.Objects.clone(credential);

        updateValidationState();

        Emotive.App.changePage("#MainPage");       
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
    if (Emotive.Data.credential.validationState == -2)
    {
        $("#validationState").append('<span style="color:#ff0000">The current credentials have expired.</span>');
    }
    else if (Emotive.Data.credential.validationState == -20)
    {
        $("#validationState").append('<span style="color:#ff0000">Could not find target system.</span>');
    }
    else if (Emotive.Data.credential.validationState == -30)
    {
        $("#validationState").append('<span style="color:#ff0000">Unable to contact service.</span>');
    }
    else if (Emotive.Data.credential.validationState < 0)
    {
        $("#validationState").append('<span style="color:#ff0000">The current credentials are invalid.</span>');
    }
    else if (Emotive.Data.credential.validationState > 0)
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

    Emotive.Js.Objects.compareClones(Emotive.Data.credential);

    if (Emotive.Data.credential.ISMODIFIED)
    {
        Emotive.Data.set("Emotive.Data.credential.externalUsername",Emotive.Data.credential.externalUsername.trim());
        Emotive.Data.set("Emotive.Data.credential.externalPassword",Emotive.Data.credential.externalPassword.trim());
        Emotive.Data.set("Emotive.Data.credential.externalToken",Emotive.Data.credential.externalToken.trim());

        Emotive.Js.Objects.clone(Emotive.Data.credential);

        if (Emotive.Data.credential.externalUsername.length == 0)
        {
            Emotive.Ui.Dialog.alert("Username may not be empty");
            return;
        }

        if (Emotive.Data.credential.externalPassword.length == 0)
        {
            Emotive.Ui.Dialog.alert("Password may not be empty");
            return;
        }

        if (Emotive.Data.credential.externalToken.length == 0)
        {
            Emotive.Ui.Dialog.alert("Token may not be empty");
            return;
        }

        var obj = new Object();
        obj.op = "INVOKE";
        obj.targetType = "CdmExternalSystem";
        obj.name = "updateExternalCredentials";
        obj.params = new Object();
        obj.params.externalSystem = Emotive.Data.credential.externalSystem;
        obj.params.username = Emotive.Data.credential.externalUsername;
        obj.params.password = Emotive.Data.credential.externalPassword;
        obj.params.token = Emotive.Data.credential.externalToken;

        Emotive.Service.submit([new NonQueryRequestObject(obj)],
        function(requestArray)
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
                    Emotive.Data.credential.validationState = cdmStatus.validationState;

                    updateValidationState();

                    //
                    //  The changes were saved, but they are known to be invalid
                    //
                    if (Emotive.Data.credential.validationState <= 0)
                    {

                        Emotive.Ui.Dialog.alert("The credentials have been updated but are NOT valid.");
                    }
                    //
                    //  The changes were saved and are known to be valid.
                    //
                    else
                    {
                        Emotive.Ui.Dialog.alertAndExit("The credentials have been updated and are valid.",EXIT_APPLICATION_TO_CREDENTIAL_SETTINGS);
                    }
                }
                else
                {
                    Emotive.App.exitOnServiceError(JSON.stringify(obj),restResponse,"Error in 'updateExternalCredentials'");
                }
            }
             else
            {
                Emotive.App.exitOnApplicationError("No RestResponse returned from 'updateExternalCredentials'");
            }

        });
    }
    else
    {
        Emotive.Ui.Dialog.alert("No credentials were changed");
    }

}




