Example proxy code for accessing USGS earthquake data

# USGS Template

The USGS template is a simple example of providing an integration proxy that pulls in data from a publicly available data feed, in this case the USGS earthquake data, that is available at: http://earthquake.usgs.gov

## USGS Model

The model.json file for the usgs template defines a CdmExternalSystem called 'usgs'.

It defines one CdmType, 'Feature', which will contain the subset of data from the usgs datafeed that we will display in the example app.

The CdmType Feature is bound to the external system, 'usgs', so whenever a Feature is requested by the example app, the Emotive server will ask the USGS proxy (see below) for the most up-to-date informtion from the USGS data feed.

## USGS Proxy

Like most Emotive proxies, the usgs proxy requires 'emproxy' which implements the basic protocol for communicating with the Emotive container.

The call:

emproxy.init(function afterInitCallback(initialConfig) {
    emproxy.start(processDirective);
});

The 'init' function identifies the proxy to the container that started it, and provides an initialConfig, which is a JSON document passed in by the container on initilization. In the case of the usgs proxy, we will not need any of the information from the initialConfig document.

The 'start' function provides a callback, processDirective, which accepts queries from the Emotive servers and returns CDM objects.

In this example, processDirective will only receive 'SELECT' queries from the server, which may contain a 'where' caluse with a timestamp which tells the proxy the time range of data needed to bring the Emotive server cache up to date. The USGS data feed has three levels of detail, for >1.0 earthquakes, hourly, daily, and weekly. The server will request the smallest time window needed to bring the list up to date.

The data from USGS is in GeoJSON format. The proxy converts it into CDM format to provide the Emotive server with a CDM object called "Feature" that is the subset of GeoJSON that we need for the example app.
