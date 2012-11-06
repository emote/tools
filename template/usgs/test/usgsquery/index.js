var util = require('util');

var session;

module.exports = function(sessionParam,cb) {
    session = sessionParam;

    session.directive({
        op: 'SELECT',
        targetType: 'Feature'
    },function(err,res) {
        if(!err) {
            if(!res || !res.results) {
                err = new Error('SELECT of Feature returned unexpected reply: ' + res);
            } else if(res.results.length === 0) {
                err = new Error('SELECT of Feature returned no results');
            } else if(!res.results[0].mag) {
                err = new Error('SELECT of Feature result without a magnitude: ' + util.inspect(res.results[0],false,null));
            }
        } else {
            console.log('Synchronous query of Feature succeeded.');
        }

        session.directive({
            op: 'SELECT',
            targetType: 'Feature',
            options: {"async":true}
        },function(err,res) {
            if(!err) {
                if(!res || !res.results) {
                    err = new Error('SELECT of Feature returned unexpected reply: ' + res);
                } else if(res.results.length === 0) {
                    err = new Error('SELECT of Feature returned no results');
                } else if(!res.results[0].mag) {
                    err = new Error('SELECT of Feature result without a magnitude: ' + util.inspect(res.results[0],false,null));
                }
            } else {
                console.log('Asynchronous query of Feature succeeded.');
            }

            cb(err);
        });
    });
}
