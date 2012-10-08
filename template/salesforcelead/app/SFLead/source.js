"use strict";
//
//  Salesforce Leads
//
$(document).ready(CDF_Initialize);

var currentLocObject = null;

function CDF_Ready()
{
    //
    //  Declare whether or not this application would benefit from data caching
    //
    FW.allowDataCaching = true;

    var requestedQueries = new Array();
    requestedQueries.push(new DeclareDataValueObject("DM.lead","Lead"));
    requestedQueries.push(new QueryRequestObject({op:'SELECT', targetType:'Lead'},"DM.allLeads","DM.allLeadsHash",{extraHashKey:"externalId"}));
    FW.submitToServer(onRequestDataReady, requestedQueries);

    //
    // Declare an event handler to fire before the #Loading page is about to be shown.
    //
    $('#Loading').bind('pagebeforeshow', function(event)
    {
        FW.setHeaderTitle("Loading...");
    });

//
// Declare an event handler to fire before the #MainPage page is about to be shown.
//
    $('#MainPage').bind('pagebeforeshow', function(event)
        {
            FW.setHeaderTitle("Leads");
            FW.setBack(null);
        }
    );

    //
    // Declare an event handler to fire before the #LeadDetail page is about to be shown.
    //
    $('#LeadDetail').bind('pagebeforeshow', function(event)
        {
            FW.setHeaderTitle(DM.lead.Name);
            FW.setBack('#MainPage');
        }
    );
}


//
//	This gets called when the MetaData and Query requests have completed; we have all our data
//	and we are ready to start.
//
function onRequestDataReady()
{
    $("#leadList").empty();

    var s = "";

    FW.sortObjectsByString(DM.allLeads, "Name", true);

    for (var i=0; i<DM.allLeads.length; i++)
    {
        var lead = DM.allLeads[i];

        s +=    '<li>' +
                    '<a href="javascript:selectLead(\'' + lead.externalId + '\')">' +
                        lead.Name +
                    '</a>' +
                '</li>';
    }

    $("#leadList").append(s);

    FW.refreshListview("#leadList");

    FW.changePage("#MainPage");
};

function selectLead(externalId)
{
    var lead = DM.allLeadsHash[externalId];

    DM.set("DM.lead",lead);

    $("#theEmail").attr('href', 'mailto:' + DM.lead.Email);
    $("#thePhone").attr('href', 'tel:' + DM.lead.Phone);

    FW.changePage("#LeadDetail");
}

