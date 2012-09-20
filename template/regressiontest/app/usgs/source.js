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
    //  These are the queries we will need to begin the application (and the DM.* variables which will contain the result).
    //
    var requestedQueries = new Array();
    requestedQueries.push(new QueryRequestObject({op:"SELECT", targetType:"Feature"}, "DM.allFeatures", "DM.featureHash"));
    
    //
    //  Initialize the Framework; this will activate the Element-to-Data bindings and run the requested
    //  queries (for data and metadata). This is data we need before the first page can be displayed.
    //
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
        FW.setHeaderTitle("Earthquakes");
        FW.setBack(null);
    });

    //
    // Declare an event handler to fire after the #Map page has been shown.
    //
    $('#Map').bind('pageshow', function(event)
        {
            loadMap();
            FW.setHeaderTitle("Map");
            FW.setBack('#MainPage');
            FW.setRightButton(null);
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

    var fo = FW.getCdfTypeFromHash("Date");

    var html = "";

    var features = DM.allFeatures;

    FW.sortObjectsByNumber(features, "mag", false);
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

    FW.refreshListview("#earthquakes");

    FW.changePage("#MainPage");
}

function featureClicked(featureId)
{
    DM.feature = DM.featureHash[featureId];

    if (DM.feature)
    {
        FW.changePage("#Map");
    }
}

function loadMap()
{
    // Initialize the center point of the map
    DM.quakePosition = new google.maps.LatLng(DM.feature.latitude,DM.feature.longitude);

    // Create the options for the map
    var myOptions =
    {
        center : DM.quakePosition,
        zoom : 9,
        mapTypeId : google.maps.MapTypeId.ROADMAP
    };

    $("#map_canvas").css('height',FW.getClientHeight() + "px");
    $("#map_canvas").css('width',FW.getClientWidth() + "px");

    //
    //  If the map already exists we just need to recenter
    //
    if (DM.googleMap)
    {
        DM.googleMap.setOptions(myOptions);
    }
    else
    {
        // Create the map
        DM.googleMap = new google.maps.Map(document.getElementById("map_canvas"), myOptions);

        // Bind the listener for canvas resize (in the event of a change from portrait to landscape)
        google.maps.event.addListener(document.getElementById("map_canvas"), 'resize',
            function()
            {
                $("#map_canvas").css('height',FW.getClientHeight() + "px");
                $("#map_canvas").css('width',FW.getClientWidth() + "px");
                DM.googleMap.setCenter(DM.quakePosition);
            });
    }

    //
    //  Add a marker at the location of the quake
    //
    var marker = new google.maps.Marker(
        {
            position: DM.quakePosition,
            map: DM.googleMap,
            title: DM.feature.magAndTime
        });
}










