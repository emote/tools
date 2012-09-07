"use strict";
//
//
//	This is standard jQuery idiom; it gets called after the DOM tree has been created and is used to
//  initialize the Emotive Common Device Framework (CDF).
//
$(document).ready(CDF_Initialize);

//
//  After the DOM is loaded and the CDF is initialized this function will be called as the starting
//  point of the actual application.
//
function CDF_Ready()
{
    var requestedQueries = new Array();
    requestedQueries.push(new DeclareDataValueObject("DM.hello","String"));
    //
    //  In most apps this call will include REST requests to the Emotive Mobile Messaging Server (MMS). In this
    //  simple example we just declare the "DM.hello" data value and immediately invoke the onRequestDataReady()
    //  callback function below.
    //
    FW.submitToServer(onRequestDataReady, requestedQueries);

    $('#Loading').bind('pagebeforeshow', function(event)
    {
        FW.setHeaderTitle("Loading...");
    });

    $('#MainPage').bind('pagebeforeshow', function(event)
    {
        FW.setHeaderTitle("Hello, World!");
        FW.setBack(null);
    });
}

//
//  After the FW.submitToServer call above has completed it will drive this callback. In applications
//  which do actual server requests the query results would now be available.
//
function onRequestDataReady()
{
    DM.set("DM.hello","Hello, " + FW.getUsername() + "!");
    FW.changePage("#MainPage");
}

