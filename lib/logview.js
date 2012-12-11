var mms = require('./mms');
var common = require('./common');

//
//  The optimist argv array, propagated from the caller
//
var argv;

//
//  The MMS Session object propagated from the caller
//
var session;

//
//  The maximum number of log rows we try to get in one blast
//
var ROW_LIMIT = 200;

//
//  In "tail" mode, this is the time between attempts to get more log messages
//
var refreshIntervalInMs;

//
//  In "tail" mode this is the timestamp of the last read message, which we can use to
//  poll for the next set as it comes in.
//
var lastTime = 0;

//
//  The array of names of the loggers from which we are reading. If null it means to get message from all logger sources.
//
var loggerNameList = [];

//
//  The array of log level names in which we are interested; if null it means we want all levels of log messages
//
var logLevelList = [];

//
//  The REST query object we will build in memory to get the desired set of log records
//
var queryObject = null;

//
//  By default we hide any of these 'noise' messages that clutter the log. If the caller specified --showNoise
//  we won't hide these.
//
var noise = [
                'REST REQUEST: {"op":"INVOKE","targetType":"CdmMessage","name":"fetchActiveMessages"} REST RESPONSE: SUCCESS',
                'REST REQUEST: {"op":"SELECT","targetType":"CdmUser","properties":[],"where":{"username":"mms"}} REST RESPONSE: SUCCESS'
            ]


exports.showLog = function showLog(startTime,endTime)
{
    argv = common.global.argv;
    session = common.global.session;
    refreshIntervalInMs = argv.refreshInterval;

    var obj = new Object();

    obj.op = "SELECT";
    obj.targetType = "CdmLog";
    obj.properties = ["time","message","tenant","level","logger","username"];
    obj.options = new Object();
    obj.options.limit = ROW_LIMIT;
    obj.options.startAt = 0;

    obj.where = new Object();

    var dt;

    if (argv.tail)
    {
        if (startTime)
        {
            dt = convertTimeStringToDate(startTime);
            startTime = formatAsGMT(dt);
        }
        //
        //  If --tail was specified but no start time then assume "5m"
        //
        else
        {
            dt = new Date();
            var sTimeInMs = dt.getTime() - 5 * 60 * 1000;
            dt = new Date(sTimeInMs);
            startTime = formatAsGMT(dt);
        }
    }
    else
    {
        if (!startTime)
        {
            console.log("Either a startTime or --tail must be specified");
            process.exit(1);
        }

        dt = convertTimeStringToDate(startTime);
        startTime = formatAsGMT(dt);
    }

    if (argv.verbose) console.log("Start Time GMT = " + startTime + " Local = " + formatAsLocal(dt));

    obj.where.time = new Object();
    obj.where.time.$gte = startTime;

    if (!argv.tail && endTime)
    {
        dt = convertTimeStringToDate(endTime);
        endTime = formatAsGMT(dt);
        if (argv.verbose) console.log("End Time GMT = " + endTime + " Local = " + formatAsLocal(dt));

        obj.where.time.$lte = endTime;
    }

    if (argv.regex)
    {
        obj.where.message = new Object();
        obj.where.message.$regex = argv.regex;
        if (argv.verbose) console.log("Only show log records matching regular expression: " + argv.regex);
    }

    if (argv.hide)
    {
        argv.hidePattern = new RegExp(argv.hide,"i");
        if (argv.verbose) console.log("Hide log records matching regular expression: " + argv.hide);
    }

    if (argv.tenant)
    {
        if (argv.verbose) console.log("Only show log records for tenant " + argv.tenant);
        obj.where.tenant = argv.tenant;
    }

    if (argv.local)
    {
        if (argv.verbose) console.log("Timestamp values will be converted to local time");
    }

    if (argv.loggerName)
    {
        loggerNameList = argv.loggerName.split(',');

        obj.where.logger = new Object();
        obj.where.logger['$in'] = loggerNameList;
    }
    if (argv.logLevel)
    {
        logLevelList = argv.logLevel.split(',');

        obj.where.level = new Object();
        obj.where.level['$in'] = logLevelList;
    }

    queryObject = obj;

    executeQuery();
}

//
//  Pad the numeric string out to length '2' by prepending zeroes.
//
function pad2(s)
{
    if (s >= 10)
    {
        return s;
    }
    else
    {
        return "0" + s;
    }
}

//
//  Pad the numeric string out to length '3' by prepending zeroes.
//
function pad3(s)
{
    if (s >= 100)
    {
        return s;
    }
    else if (s >= 10)
    {
        return "0" + s;
    }
    else
    {
        return "00" + s;
    }
}

//
//  Format the Date object as a GMT date/time string, suitable for use in a REST 'where' clause on the 'time' property.
//
function formatAsGMT(dt)
{
    var s = dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth()+1) + "-" + pad2(dt.getUTCDate()) + " " +
        pad2(dt.getUTCHours()) + ":" + pad2(dt.getUTCMinutes()) + ":" + pad2(dt.getUTCSeconds());

    return s;
}

//
//  Format the Date object as a local date/time string. This only needs to be human readable.
//
function formatAsLocal(dt)
{
    var s = dt.getFullYear() + "-" + pad2(dt.getMonth()+1) + "-" + pad2(dt.getDate()) + " " +
        pad2(dt.getHours()) + ":" + pad2(dt.getMinutes()) + ":" + pad2(dt.getSeconds()) + "." + pad3(dt.getMilliseconds());

    return s;
}

//
//  Parse the "startTime" and "endTime" parameters supplied by the user and return an appropriate Date object.
//  If it's of the form "5m" or "5h" we convert it to "5 minutes (or hours) before the current time". Otherwise
//  we let JavaScript parse it, which means it should be happy any of these forms:
//
//      GMT specified as ISO 8601: 2012-09-13T17:30:00
//      Local time specified as ISO 8601 and including the offset to the timezone: 2012-09-13T10:30:00-07:00
//      Local time, assuming your current timezone (the quotes are required): "2012-09-13 10:30:00"
//
function convertTimeStringToDate(s)
{
    var dt;

    var lastChar = s.charAt(s.length-1);

    if (    (lastChar == "m")
        ||  (lastChar == "h"))
    {
        var valueString = s.substring(0, s.length-1);
        var value = Number(valueString);

        if (lastChar == "m")
        {
            var t = new Date().getTime() - (value * 60 * 1000);
            dt = new Date(t);
        }
        else if (lastChar = "h")
        {
            var valueString = s.substring(0, s.length-1);
            var value = Number(valueString);
            var t = new Date().getTime() - (value * 60 * 60 * 1000);
            dt = new Date(t);
        }

        //
        //  The Emotive servers all have their clocks set to GMT. For developers running a local copy of the
        //  server the clock will be set to local time; compensate for  the assumption when talking to 'localhost'.
        //
        if (session.baseURLString.indexOf("localhost") >= 0)
        {
            if (argv.verbose) console.log("Assuming server clock is set to local time for localhost");

            //
            //  Shift the time to compensate for the fact that the server clock is set to local time not GMT
            //
            var time = dt.getTime() - dt.getTimezoneOffset()*60*1000;
            dt = new Date(time);
        }
    }
    else
    {
        dt = new Date(s);
    }

    return dt;
}

//
//  Execute the REST query we have built and return a block of log records
//
function executeQuery()
{
    if (argv.verbose) console.log("***QUERY*** " + JSON.stringify(queryObject));

    session.directive(queryObject,onGetLogRecords);
}

//
//  Parse the date/time string from the logEntry.time property and return a corresponding Date object; these
//  strings look like this:
//
//  2012-09-18 15:22:47,355
//
function parseDateString(ds)
{
    var pairs = ds.split(" ");
    var dateString = pairs[0];
    var timeString = pairs[1];

    pairs = dateString.split("-");
    var year = pairs[0];
    var month = pairs[1]-1;
    var day = pairs[2];

    pairs = timeString.split(",");
    timeString = pairs[0];
    var ms = pairs[1];
    pairs = timeString.split(":");
    var hours = pairs[0];
    var minutes = pairs[1];
    var seconds = pairs[2];

    //
    //  Javascript expects these are in local time, but they are really GMT. We will need
    //  to compensate below.
    //
    var dt = new Date(year,month,day,hours,minutes,seconds,ms);

    //
    //  Shift the time to compensate for the fact that we gave it GMT instead of local.
    //
    var time = dt.getTime() - dt.getTimezoneOffset()*60*1000;

    dt = new Date(time);
    return dt;
}

//
//  This handler gets driven when the response comes back from the REST query - it should contain a
//  payload of log records.
//
function onGetLogRecords(err,resultObject)
{
    //console.log("ERR=" + err);
    //console.log("resultObject=" + JSON.stringify(resultObject));

    if (resultObject.targetType == 'RestResponse')
    {
        if (resultObject.status == 'SUCCESS')
        {
            var eaten = 0;
            var shown = 0;

            //
            //  Walk through each returned log record.
            //
            for (var i=0; i<resultObject.results.length; i++)
            {
                var logEntry = resultObject.results[i];
                lastTime = logEntry.time;

                //
                //  The caller can ask to have records with a certain string be hidden
                //
                if (argv.hide)
                {
                    if (logEntry.message.search(argv.hidePattern) >= 0)
                    {
                        eaten++;
                        continue;
                    }
                }

                //
                //  Unless the user asked for it we will hide some of the uninteresting "noise"
                //  often found in the log.
                //
                if (!argv.showNoise)
                {
                    var skip = false;

                    if (logEntry.level == "AUDIT")
                    {
                        //
                        //  Hide the "tail" messages
                        //
                        if (logEntry.message.indexOf('REST REQUEST: {"op":"SELECT","targetType":"CdmLog","properties":["time",') == 0)
                        {
                            skip = true;
                        }
                        else
                        {
                            for (var j=0; j<noise.length; j++)
                            {
                                if (logEntry.message == noise[j])
                                {
                                    skip = true;
                                }
                            }
                        }
                    }

                    if (skip)
                    {
                        eaten++;
                        continue;
                    }
                }

                shown++;

                var formattedTime;

                //
                //  If requested take the GMT times from the server and display them as local
                //
                if (argv.local)
                {
                    var dt = parseDateString(logEntry.time);
                    formattedTime = formatAsLocal(dt) + "L";
                }
                //
                //  The times that come from the server are GMT
                //
                else
                {
                    formattedTime = logEntry.time;
                }

                //
                //  If requested emit the output in CSV format
                //
                if (argv.csv)
                {
                    var cookedMessage = '"' + logEntry.message.replace(/"/g,'""') + '"';
                    console.log('"' + formattedTime + '",' + logEntry.tenant + ',' + logEntry.username + ',' + logEntry.level + ',' + cookedMessage);
                }
                //
                //  Otherwise just format it form human consumption
                //
                else
                {
                    var tenant = "   " + logEntry.tenant;
                    tenant = tenant.substring(tenant.length-4);

                    var out = new Array();
                    out.push(formattedTime);

                    //
                    //  We only need to display the tenant if we are mms
                    //
                    if (session.creds.username == 'mms') out.push(tenant);

                    //
                    //  The log level is only relevant if the user didn't explicitly ask for one
                    //
                    if ((logLevelList.length != 1)) out.push(logEntry.level);

                    //
                    //  The logger source is only useful if the user explicitly asked for more than one. (If they
                    //  asked for "ALL" they probably don't care where it came from.)
                    //
                    if (loggerNameList.length > 1) out.push(logEntry.logger);

                    out.push(logEntry.message);

                    console.log(out.join(' | '));
                }
            }

            //console.log("Returned=" + resultObject.results.length + " Hidden=" + eaten + " Shown=" + shown);

            //
            //  We got the max number of rows; maybe there are more.
            //
            if (resultObject.results.length == ROW_LIMIT)
            {
                //
                //  Tweak the query object to get the next block of rows and run the query again.
                //
                queryObject.options.startAt = queryObject.options.startAt + ROW_LIMIT;
                executeQuery();
            }
            //
            //  In tail mode we prepare to run the query again after the refresh interval has elapsed.
            //
            else if (argv.tail)
            {
                queryObject.options.startAt = 0;
                queryObject.where.time = new Object();
                queryObject.where.time.$gt = lastTime;

                setTimeout(executeQuery,refreshIntervalInMs);
            }
        }
        else
        {
            console.log(resultObject.status);
            process.exit(1);
        }
    }
    else
    {
        console.log("The resultObject was not a RestResponse: " + JSON.stringify(resultObject));
        process.exit(1);
    }
}


