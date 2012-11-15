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
    Emotive.App.Collections.allowCaching(true);

    var requestedQueries = new Array();
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.lead","Lead"));
    requestedQueries.push(new QueryRequestObject({op:'SELECT', targetType:'Lead'},"Emotive.Data.allLeads","Emotive.Data.allLeadsHash"));
    Emotive.Service.submit(requestedQueries, onRequestDataReady);

    //
    // Declare an event handler to fire before the #Loading page is about to be shown.
    //
    $('#Loading').bind('pagebeforeshow', function(event)
    {
        Emotive.Ui.Header.setTitle("Loading...");
    });

//
// Declare an event handler to fire before the #MainPage page is about to be shown.
//
    $('#MainPage').bind('pagebeforeshow', function(event)
        {
            Emotive.Ui.Header.setTitle("Leads");
            Emotive.Ui.Header.setBackButton(null);
        }
    );

    //
    // Declare an event handler to fire before the #LeadDetail page is about to be shown.
    //
    $('#LeadDetail').bind('pagebeforeshow', function(event)
        {
            Emotive.Ui.Header.setTitle(Emotive.Data.lead.Name);
            Emotive.Ui.Header.setBackButton('#MainPage');
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

    Emotive.Js.Arrays.sortObjectsByString(Emotive.Data.allLeads, "Name", true);

    for (var i=0; i<Emotive.Data.allLeads.length; i++)
    {
        var lead = Emotive.Data.allLeads[i];

        s +=    '<li>' +
                    '<a href="javascript:selectLead(\'' + lead.externalId + '\')">' +
                        lead.Name +
                    '</a>' +
                '</li>';
    }

    $("#leadList").append(s);

    Emotive.$.refreshListview("#leadList");

    Emotive.App.changePage("#MainPage");
};

function selectLead(externalId)
{
    var lead = Emotive.Data.allLeadsHash[externalId];

    Emotive.Data.set("Emotive.Data.lead",lead);

    $("#theEmail").attr('href', 'mailto:' + Emotive.Data.lead.Email);
    $("#thePhone").attr('href', 'tel:' + Emotive.Data.lead.Phone);

    Emotive.App.changePage("#LeadDetail");
}

