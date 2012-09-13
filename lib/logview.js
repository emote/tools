var mms = require('./mms');
var util = require('util');

var ROW_LIMIT = 100;
var loggerNameList = null;
var logLevelList = null;
var session;
var waitTime;
var mmsLogTime;
var lastTime;

var query;

var lastMinute = null;

exports.tail = function tail(sessionParam,begin,refreshInterval,loggerName,logLevel) {
    //console.log("loggerName;logLevel " + loggerName +";" +logLevel)
    session = sessionParam;
    logLevelList = logLevel.split(',');
    loggerNameList = loggerName.split(',');
    waitTime = refreshInterval;
    var d;
    if(!begin) {
        d = new Date();
    } else if(begin.charAt(begin.length-1) === 'm') {
        var t = new Date().getTime();
        var delta = begin.substring(0,begin.length-1); // delta in minutes
        d = new Date(t - delta * 60000);
        console.log("Begin " + delta + " minutes ago:");
    } else {
        d = new Date(begin);
    }
    mmsLogTime = ALTmmsLogTimeString(d);
    lastTime = mmsLogTime;

    query = {
        op: 'SELECT',
        targetType: 'CdmLog',
        where: {
            time: {'$gt' : mmsLogTime},
            logger: {'$in': loggerNameList},
            level: {'$in': logLevelList}
        },
        options: {limit: ROW_LIMIT, startAt: 0}
    };

    fetchLogEntries();
}

function fetchLogEntries() {
    //console.log("Log query:");
    //console.log(util.inspect(query,false,null));

    session.directive(query,printLogEntries);
}

function printLogEntries(err,resp) {
    if(!resp.results) {
        console.log("Unexpected reply from CdmLog query: " + util.inspect(resp,false,null));
        process.exit(1);
    }

    resp.results.forEach(function(entry) {
        var lastColon = entry.time.lastIndexOf(':');
        var thisMinute = entry.time.substring(0,lastColon - 1);
        var seconds = entry.time.substr(lastColon + 1);

        if(thisMinute != lastMinute){
            console.log([entry.time,entry.loggerName,entry.logLevel].join(' '));
            lastMinute = thisMinute;
        }

        var message;
        if(typeof(entry.message)==='string') {
            message = entry.message;
        } else {
            message = entry.message.toString();
        }
        var line = [seconds];
        if(logLevelList.length > 1) line.push(entry.level);
        if(loggerNameList.length > 1) line.push(entry.logger);
        line.push(message);

        console.log(line.join(' '));

        lastTime = entry.time;
    });

    if(resp.results.length === ROW_LIMIT) {
        query.options.startAt = query.options.startAt + ROW_LIMIT;
        fetchLogEntries(); 
    } else {
        query.options.startAt = 0;
        query.where.time['$gt'] = lastTime;
        setTimeout(fetchLogEntries,waitTime);
    }
}

function pad(n){
    return (n<10 ? '0'+n : n);
}

function pad3(n){
    return (n<10 ? '00'+n : n<100 ? '0'+n : n);
}

function mmsLogTimeString(d) {
    // yyyy-MM-dd HH:mm:ss,SSS
    return d.getUTCFullYear()+'-'
    + pad(d.getUTCMonth()+1)+'-'
    + pad(d.getUTCDate())+' '
    + pad(d.getUTCHours())+':'
    + pad(d.getUTCMinutes())+':'
    + pad(d.getUTCSeconds())+','
    + pad3(d.getUTCMilliseconds()); 
}

function ALTmmsLogTimeString(d) {
    // yyyy-MM-dd HH:mm:ss,SSS
    return d.getFullYear()+'-'
    + pad(d.getMonth()+1)+'-'
    + pad(d.getDate())+' '
    + pad(d.getHours())+':'
    + pad(d.getMinutes())+':'
    + pad(d.getSeconds())+','
    + pad3(d.getMilliseconds()); 
}
