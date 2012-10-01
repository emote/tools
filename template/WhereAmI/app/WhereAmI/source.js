"use strict";
//
//  Emotive Generic - Where is everybody?
//
$(document).ready(CDF_Initialize);

var currentLocObject = null;

function CDF_Ready()
{
    // Provide the callback to the function that will get called every time the coordinates update
    FW.watchPosition(currentPositionUpdated);

    //
    //  Declare whether or not this application would benefit from data caching
    //
    FW.allowDataCaching = true;

    var options = {onCacheComplete:onCacheComplete};

    var obj = FW.getPersistedProperties();

    if (obj && obj.cacheIsDirty)
    {
        //
        //  'cacheIsDirty' is signal from the previous execution of the app that we *know* at least one
        //  change will come back in the next query. If so then the app will set the refreshNotificationStrategy
        //  to RS_WAIT_FOR_RESPONSE, which avoids the certain "accept changes?" notification that would
        //  result. It just means the app will take a little longer to start because it won't rely on the
        //  data cache, but the user won't have to be bothered by a notification message.
        //
        FW.setPersistedProperties({cacheIsDirty:true});

        options.refreshNotificationStrategy = RS_WAIT_FOR_RESPONSE;
    }

    var requestedQueries = new Array();
    requestedQueries.push(new DeclareDataValueObject("DM.formattedNotes","String"));
    requestedQueries.push(new DeclareDataValueObject("DM.me","UserInfo"));
    requestedQueries.push(new DeclareDataValueObject("DM.person","UserInfo"));
    requestedQueries.push(new QueryRequestObject({op:'SELECT', targetType:'UserInfo'},"DM.allPeople","DM.allPeopleHash",{extraHashKey:"username"}));

    //
    //  Initialize the Framework; this will activate the Element-to-Data bindings and run the requested
    //  queries (for data and metadata). This is data we need before the first page can be displayed.
    //
    FW.submitToServer(onRequestDataReady, requestedQueries,options);

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
            FW.setHeaderTitle("Where am I?");
            FW.setBack(null);
        }
    );

    //
    // Declare an event handler to fire before the #PersonDetail page is about to be shown.
    //
    $('#PersonDetail').bind('pagebeforeshow', function(event)
        {
            FW.setHeaderTitle(DM.person.alias);
            FW.setBack('#MainPage');
        }
    );
    //
    // Declare an event handler to fire before the #EditPage page is about to be shown.
    //
    $('#EditPage').bind('pagebeforeshow', function(event)
        {
            FW.setHeaderTitle("Edit details");
            FW.setBack('#MainPage');
        }
    );
    $('#EditPage').bind('pageshow', function(event)
        {
            if (DM.initializeProfile)
            {
                $('#editMyAlias').focus();
                $('#editMyAlias').select();
            }
            else
            {
                $('#editMyNotes').focus();
                $('#editMyNotes').select();
            }
        }
    );

    //
    // Declare an event handler to fire before the #Map page is about to be shown.
    //
    $('#Map').bind('pageshow', function(event)
        {
            loadMap();
            FW.setHeaderTitle("Map");
            FW.setBack('#PersonDetail');
            FW.setRightButton(null);
        }
    );

}

function onCacheComplete()
{
    FW.setPersistedProperties({cacheIsDirty:false});
}
function currentPositionUpdated(coord)
{
    //
    //	If "error" is set it contains a String explaining why the call failed.
    //
    if (coord.error)
    {
        FW.alert(coord.error);
    }
    // Otherwise extract the latitude and longitude
    else
    {
        currentLocObject = {lon:coord.longitude, lat:coord.latitude};
    }
}

//
//	This gets called when the MetaData and Query requests have completed; we have all our data
//	and we are ready to start.
//
function onRequestDataReady()
{
    var myPersonObject = DM.allPeopleHash[FW.getUsername()];
    DM.initializeProfile = false;

    //
    //  If we are not already in the database then we should force us to be added.
    //
    if (!myPersonObject)
    {
        myPersonObject = {
            targetType: "UserInfo",
            username: FW.getUsername(),
            alias: FW.getUsername(),
            notes: "",
            place: "unknown"
        };

        DM.allPeopleHash[FW.getUsername()] = myPersonObject;
        DM.allPeople.push(myPersonObject);

        DM.initializeProfile = true;
    }

    DM.set("DM.me",myPersonObject);

    $("#peopleList").empty();

    var s = "";

    DM.markerHash = new Object();

    FW.sortObjectsByString(DM.allPeople, "alias", true);

    var fodt = FW.getCdfTypeFromHash("Date");

    for (var i=0; i<DM.allPeople.length; i++)
    {
        var person = DM.allPeople[i];

        var loc = FW.getEnumerationObject('Place',person.place);
        var locString;

        if (person.loc)
        {
            //
            //  Try and groups close locations together
            //
            var longitude = person.loc.lon.toFixed(4);
            var latitude = person.loc.lat.toFixed(4);
            var key = "Ln" + longitude + "Lt" + latitude;

            var area = DM.markerHash[key];

            if (!area)
            {
                area = new Object();
                area.longitude = longitude;
                area.latitude = latitude;
                area.people = new Array();
                DM.markerHash[key] = area;
            }

            area.people.push(person);
        }
        /*
        if (person.timeOfUpdate)
        {
            locString = loc.label + " as of " + fodt.convertToFormattedValue(person.timeOfUpdate);
        }
        else
        {
            locString = loc.label;
        }
        */

        locString = loc.label;

        s +=    '<li>' +
                    '<a href="javascript:selectPerson(\'' + person.id + '\')">' +
                        person.alias +
                    '</a>' +
                    '<span class="ui-li-count">' +
                        locString +
                    '</span>' +
                '</li>';
    }

    $("#peopleList").append(s);

    FW.refreshListview("#peopleList");

    if (DM.initializeProfile)
    {
        FW.alert("You are not currently in the database; edit your profile and try again.");
        FW.changePage("#EditPage");
    }
    else
    {
        FW.changePage("#MainPage");
    }

};

function selectPerson(id)
{
    var person = DM.allPeopleHash[id];

    DM.set("DM.person",person);

    if (person.loc)
    {
        $('#longLat').text("Longitude: " + person.loc.lon + " Latitude: " + person.loc.lat);
    }
    else
    {
        $('#longLat').text("No Latitude/Longitude data");
    }
    FW.changePage("#PersonDetail");
}

function showMap()
{
    if (DM.person && DM.person.loc)
    {
        FW.changePage("#Map");
    }
    else
    {
        FW.alert("No position data");
    }

}

function loadMap()
{
    // Initialize the center point of the map
    var myLatLng = new google.maps.LatLng(DM.person.loc.lat,DM.person.loc.lon);

    // Create the options for the map
    var myOptions =
    {
        center : myLatLng,
        zoom : 12,
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
        google.maps.event.addListener(document.getElementById("map_canvas"), 'resize', function(){
            $("#map_canvas").css('height',FW.getClientHeight() + "px");
            $("#map_canvas").css('width',FW.getClientWidth() + "px");
        });

        for (var key in DM.markerHash)
        {
            var area = DM.markerHash[key];

            FW.sortObjectsByString(area.people, "alias", true);

            var title = null;

            for (var i=0; i<area.people.length; i++)
            {
                var person = area.people[i];

                if (title)
                {
                    title += ", " + person.alias;
                }
                else
                {
                    title = person.alias;
                }
            }
            var marker = new google.maps.Marker(
                {
                    position: new google.maps.LatLng(area.latitude,area.longitude),
                    map: DM.googleMap,
                    title: title
                });

        }

    }




}

function updateMe()
{
    var obj = new Object();
    var subject;

    if (DM.initializeProfile)
    {
        obj.op = "INSERT";
        subject = "Initialize my location status profile";
    }
    else
    {
        obj.op = "UPDATE";

        obj.where = new Object();
        obj.where.id = DM.me.id;

        var newPlaceObj = FW.getEnumerationObject('Place',DM.me.place);
        subject = "Changed my location to '" + newPlaceObj.label + "'";
    }

    DM.set("DM.me.timeOfUpdate",(new Date()).getTime());

    obj.targetType = "UserInfo";

    obj.values = new Object();
    obj.values["username"] = DM.me.username;
    obj.values["place"] = DM.me.place;
    obj.values["timeOfUpdate"] = DM.me.timeOfUpdate;
    obj.values["notes"] = DM.me.notes;
    obj.values["alias"] = DM.me.alias;
    obj.values["loc"] = currentLocObject;

    if (currentLocObject == null)
    {
        FW.alert("No Latitude/Longitude data yet; try again");
        return;
    }

    FW.submitToServer(function(requestArray)
        {
            //
            //  This is signal to the *next* invocation of the app that we *know* at least one
            //  change will come back in the query. If so then the app will set the refreshNotificationStrategy
            //  to RS_WAIT_FOR_RESPONSE, which avoids the certain "accept changes?" notification that would
            //  result. It just means the app will take a little longer to start because it won't rely on the
            //  data cache, but the user won't have to be bothered by a notification message.
            //
            FW.setPersistedProperties({cacheIsDirty:true});
            FW.fadeawayAndExit("Success");
        },
        [new NonQueryRequestObject(obj,{subject:subject})]);

}

function editMyStatus()
{
    FW.changePage("#EditPage");
}

BindingObject.defineFunction("formatNotes",["DM.person.notes"]);
function formatNotes(trackerObject)
{
    var txt;

    if (DM.person && DM.person.notes)
    {
        txt = DM.person.notes.replace(/\n/g,"</br>");
    }
    else
    {
        txt = "";
    }

   DM.set("DM.formattedNotes",txt);
}
