"use strict";
//
//  Emotive Generic - Where is everybody?
//
$(document).ready(CDF_Initialize);

var currentLocObject = null;

function CDF_Ready()
{
    // Provide the callback to the function that will get called every time the coordinates update
    Emotive.Device.Gps.watchPosition(currentPositionUpdated);

    //
    //  Declare whether or not this application would benefit from data caching
    //
    Emotive.App.Collections.allowCaching(true);

    var options = {onCacheComplete:onCacheComplete};

    var obj = Emotive.App.Collections.getPersistedProperties();

    if (obj && obj.cacheIsDirty)
    {
        //
        //  'cacheIsDirty' is signal from the previous execution of the app that we *know* at least one
        //  change will come back in the next query. If so then the app will set the refreshNotificationStrategy
        //  to RS_WAIT_FOR_RESPONSE, which avoids the certain "accept changes?" notification that would
        //  result. It just means the app will take a little longer to start because it won't rely on the
        //  data cache, but the user won't have to be bothered by a notification message.
        //
        Emotive.App.Collections.setPersistedProperties({cacheIsDirty:true});

        options.refreshNotificationStrategy = RS_WAIT_FOR_RESPONSE;
    }

    var requestedQueries = new Array();
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.formattedNotes","String"));
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.me","UserInfo"));
    requestedQueries.push(new DeclareDataValueObject("Emotive.Data.person","UserInfo"));
    requestedQueries.push(new QueryRequestObject({op:'SELECT', targetType:'UserInfo'},"Emotive.Data.allPeople","Emotive.Data.allPeopleHash",{extraHashKey:"username"}));

    //
    //  Initialize the Framework; this will activate the Element-to-Data bindings and run the requested
    //  queries (for data and metadata). This is data we need before the first page can be displayed.
    //
    Emotive.Service.submit(requestedQueries, onRequestDataReady, options);

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
            Emotive.Ui.Header.setTitle("Where am I?");
            Emotive.Ui.Header.setBackButton(null);
        }
    );

    //
    // Declare an event handler to fire before the #PersonDetail page is about to be shown.
    //
    $('#PersonDetail').bind('pagebeforeshow', function(event)
        {
            Emotive.Ui.Header.setTitle(Emotive.Data.person.alias);
            Emotive.Ui.Header.setBackButton('#MainPage');
        }
    );
    //
    // Declare an event handler to fire before the #EditPage page is about to be shown.
    //
    $('#EditPage').bind('pagebeforeshow', function(event)
        {
            Emotive.Ui.Header.setTitle("Edit details");
            Emotive.Ui.Header.setBackButton('#MainPage');
        }
    );
    $('#EditPage').bind('pageshow', function(event)
        {
            if (Emotive.Data.initializeProfile)
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
            Emotive.Ui.Header.setTitle("Map");
            Emotive.Ui.Header.setBackButton('#PersonDetail');
            Emotive.Ui.Header.setRightButton(null);
        }
    );

}

function onCacheComplete()
{
    Emotive.App.Collections.setPersistedProperties({cacheIsDirty:false});
}
function currentPositionUpdated(coord)
{
    //
    //	If "error" is set it contains a String explaining why the call failed.
    //
    if (coord.error)
    {
        Emotive.Ui.Dialog.alert(coord.error);
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
    var myPersonObject = Emotive.Data.allPeopleHash[Emotive.User.getName()];
    Emotive.Data.initializeProfile = false;

    //
    //  If we are not already in the database then we should force us to be added.
    //
    if (!myPersonObject)
    {
        myPersonObject = {
            targetType: "UserInfo",
            username: Emotive.User.getName(),
            alias: Emotive.User.getName(),
            notes: "",
            place: "unknown"
        };

        Emotive.Data.allPeopleHash[Emotive.User.getName()] = myPersonObject;
        Emotive.Data.allPeople.push(myPersonObject);

        Emotive.Data.initializeProfile = true;
    }

    Emotive.Data.set("Emotive.Data.me",myPersonObject);

    $("#peopleList").empty();

    var s = "";

    Emotive.Data.markerHash = new Object();

    Emotive.Js.Arrays.sortObjectsByString(Emotive.Data.allPeople, "alias", true);

    var fodt = Emotive.App.Model.getCdfTypeFromHash("Date");

    for (var i=0; i<Emotive.Data.allPeople.length; i++)
    {
        var person = Emotive.Data.allPeople[i];

        var loc = Emotive.App.Model.getEnumerationObject('Place',person.place);
        var locString;

        if (person.loc)
        {
            //
            //  Try and groups close locations together
            //
            var longitude = person.loc.lon.toFixed(4);
            var latitude = person.loc.lat.toFixed(4);
            var key = "Ln" + longitude + "Lt" + latitude;

            var area = Emotive.Data.markerHash[key];

            if (!area)
            {
                area = new Object();
                area.longitude = longitude;
                area.latitude = latitude;
                area.people = new Array();
                Emotive.Data.markerHash[key] = area;
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

    Emotive.$.refreshListview("#peopleList");

    if (Emotive.Data.initializeProfile)
    {
        Emotive.Ui.Dialog.alert("You are not currently in the database; edit your profile and try again.");
        Emotive.App.changePage("#EditPage");
    }
    else
    {
        Emotive.App.changePage("#MainPage");
    }

};

function selectPerson(id)
{
    var person = Emotive.Data.allPeopleHash[id];

    Emotive.Data.set("Emotive.Data.person",person);

    if (person.loc)
    {
        $('#longLat').text("Longitude: " + person.loc.lon + " Latitude: " + person.loc.lat);
    }
    else
    {
        $('#longLat').text("No Latitude/Longitude data");
    }
    Emotive.App.changePage("#PersonDetail");
}

function showMap()
{
    if (Emotive.Data.person && Emotive.Data.person.loc)
    {
        Emotive.App.changePage("#Map");
    }
    else
    {
        Emotive.Ui.Dialog.alert("No position data");
    }

}

function loadMap()
{
    // Initialize the center point of the map
    var myLatLng = new google.maps.LatLng(Emotive.Data.person.loc.lat,Emotive.Data.person.loc.lon);

    // Create the options for the map
    var myOptions =
    {
        center : myLatLng,
        zoom : 12,
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
        google.maps.event.addListener(document.getElementById("map_canvas"), 'resize', function(){
            $("#map_canvas").css('height',Emotive.Ui.getClientHeight() + "px");
            $("#map_canvas").css('width',Emotive.Ui.getClientWidth() + "px");
        });

        for (var key in Emotive.Data.markerHash)
        {
            var area = Emotive.Data.markerHash[key];

            Emotive.Js.Arrays.sortObjectsByString(area.people, "alias", true);

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
                    map: Emotive.Data.googleMap,
                    title: title
                });

        }

    }




}

function updateMe()
{
    var obj = new Object();
    var subject;

    if (Emotive.Data.initializeProfile)
    {
        obj.op = "INSERT";
        subject = "Initialize my location status profile";
    }
    else
    {
        obj.op = "UPDATE";

        obj.where = new Object();
        obj.where.id = Emotive.Data.me.id;

        var newPlaceObj = Emotive.App.Model.getEnumerationObject('Place',Emotive.Data.me.place);
        subject = "Changed my location to '" + newPlaceObj.label + "'";
    }

    Emotive.Data.set("Emotive.Data.me.timeOfUpdate",(new Date()).getTime());

    obj.targetType = "UserInfo";

    obj.values = new Object();
    obj.values["username"] = Emotive.Data.me.username;
    obj.values["place"] = Emotive.Data.me.place;
    obj.values["timeOfUpdate"] = Emotive.Data.me.timeOfUpdate;
    obj.values["notes"] = Emotive.Data.me.notes;
    obj.values["alias"] = Emotive.Data.me.alias;
    obj.values["loc"] = currentLocObject;

    if (currentLocObject == null)
    {
        Emotive.Ui.Dialog.alert("No Latitude/Longitude data yet; try again");
        return;
    }

    Emotive.Service.submit([new NonQueryRequestObject(obj,{subject:subject})],
        function(requestArray)
        {
            //
            //  This is signal to the *next* invocation of the app that we *know* at least one
            //  change will come back in the query. If so then the app will set the refreshNotificationStrategy
            //  to RS_WAIT_FOR_RESPONSE, which avoids the certain "accept changes?" notification that would
            //  result. It just means the app will take a little longer to start because it won't rely on the
            //  data cache, but the user won't have to be bothered by a notification message.
            //
            Emotive.App.Collections.setPersistedProperties({cacheIsDirty:true});
            Emotive.Ui.Dialog.fadeawayAndExit("Success");
        });

}

function editMyStatus()
{
    Emotive.App.changePage("#EditPage");
}

BindingObject.defineFunction("formatNotes",["Emotive.Data.person.notes"]);
function formatNotes(trackerObject)
{
    var txt;

    if (Emotive.Data.person && Emotive.Data.person.notes)
    {
        txt = Emotive.Data.person.notes.replace(/\n/g,"</br>");
    }
    else
    {
        txt = "";
    }

   Emotive.Data.set("Emotive.Data.formattedNotes",txt);
}
