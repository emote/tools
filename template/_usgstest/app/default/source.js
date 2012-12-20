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
    //  These are the queries we will need to begin the application (and the DM.* variables which will contain the result).
    //
    var requestedQueries = new Array();
    requestedQueries.push(new QueryRequestObject({op:"SELECT", targetType:"Feature"}, "Emotive.Data.allFeatures", "Emotive.Data.featureHash"));
    
    //
    //  Initialize the Framework; this will activate the Element-to-Data bindings and run the requested
    //  queries (for data and metadata). This is data we need before the first page can be displayed.
    //
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
        Emotive.Ui.Header.setTitle("Earthquakes");
        Emotive.Ui.Header.setBackButton(null);
    });

    //
    // Declare an event handler to fire after the #Map page has been shown.
    //
    $('#Map').bind('pageshow', function(event)
        {
            loadMap();
            Emotive.Ui.Header.setTitle("Map");
            Emotive.Ui.Header.setBackButton('#MainPage');
            Emotive.Ui.Header.setRightButton(null);
        }
    );

}

//
//	This gets called when the MetaData and Query requests have completed; we have all our data
//	and we are ready to start.
//
function onRequestDataReady()
{
    regenerateMainPage();
}

function regenerateMainPage()
{
    $("#earthquakes").empty();

    var fo = Emotive.App.Model.getCdfTypeFromHash("Date");

    var html = "";

    var features = Emotive.Data.allFeatures;

    Emotive.Js.Arrays.sortObjectsByNumber(features, "mag", false);
    //
    //  Generate Accounts List
    //
    for (var i=0; i<features.length; i++)
    {
        var feature = features[i];
        feature.magAndTime = 'Magnitude ' + feature.mag + ' at ' + fo.convertToFormattedValue(feature.time*1000);
        html +=  '<li data-theme="c">' +
                    '<a rel="external" href="javascript:featureClicked(\'' + feature.id + '\')">' +
                        '<h3 >' + feature.place + '</h3>' +
                        '<p >' + feature.magAndTime + '</p>' +
                    '</a>' +
                  '</li>';
    }

    $("#earthquakes").append(html);

    Emotive.$.refreshListview("#earthquakes");

    Emotive.App.changePage("#MainPage");
}

function featureClicked(featureId)
{
    Emotive.Data.feature = Emotive.Data.featureHash[featureId];

    if (Emotive.Data.feature)
    {
        Emotive.App.changePage("#Map");
    }
}

function loadMap()
{
    // Initialize the center point of the map
    Emotive.Data.quakePosition = new google.maps.LatLng(Emotive.Data.feature.latitude,Emotive.Data.feature.longitude);

    // Create the options for the map
    var myOptions =
    {
        center : Emotive.Data.quakePosition,
        zoom : 9,
        mapTypeId : google.maps.MapTypeId.ROADMAP
    };

    $("#map_canvas").css('height',Emotive.Ui.getClientHeight() + "px");
    $("#map_canvas").css('width',Emotive.Ui.getClientWidth() + "px");

    //
    //  If the map already exists we just need to recenter
    //
    if (Emotive.Data.googleMap)
    {
        Emotive.Data.googleMap.setOptions(myOptions);
    }
    else
    {
        // Create the map
        Emotive.Data.googleMap = new google.maps.Map(document.getElementById("map_canvas"), myOptions);

        // Bind the listener for canvas resize (in the event of a change from portrait to landscape)
        google.maps.event.addListener(document.getElementById("map_canvas"), 'resize',
            function()
            {
                $("#map_canvas").css('height',Emotive.Ui.getClientHeight() + "px");
                $("#map_canvas").css('width',Emotive.Ui.getClientWidth() + "px");
                Emotive.Data.googleMap.setCenter(Emotive.Data.quakePosition);
            });
    }

    //
    //  Add a marker at the location of the quake
    //
    var marker = new google.maps.Marker(
        {
            position: Emotive.Data.quakePosition,
            map: Emotive.Data.googleMap,
            title: Emotive.Data.feature.magAndTime
        });
}










