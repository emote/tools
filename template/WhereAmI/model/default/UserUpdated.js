//PROLOG - This line forces the JavaScriptProlog to be inserted
"use strict";
if (!initScript("UserUpdated",1,"TRACE"))
{
    throw "JavaScriptProlog was not installed!";
}

var event = params.event;
var subscription = params.subscription;

log.trace("Event=" + JSON.stringify(event));
log.trace("Subscription=" + JSON.stringify(subscription));

cdmError = {targetType : 'CdmStatus', status : 'SUCCESS'};
cdmError;