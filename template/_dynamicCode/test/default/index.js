var util = require('util');

var session;

module.exports = function(sessionParam,cb) {
    session = sessionParam;

    var query = {
        "op": "INVOKE",
        "targetType": "DynamicType",
        "name": "concatAll",
        "params": {"p1":"somekind","p2":222,"p3":false}
    };

    session.directive(query,function(err,res) {
        if(err) {
            console.log('INVOKE of DynamicType FAILED with error:' + err);
            return cb(err);
        }
        if(!res || !res.status) {
            err = new Error('Returned unexpected reply: ' + res);
        } else if(res.status != 'SUCCESS') {
            err = new Error('INVOKE of DynamicType FAILED: ' + util.inspect(res,false,null));
        } else {
            console.log(util.inspect(res,false,null));
            console.log('INVOKE of DynamicType succeeded.');
        }

    });
}
