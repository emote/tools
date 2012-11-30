var util = require('util');
var fs = require('fs');
var async = require('async');
var path = require('path');

var session;

var now = new Date();
var uniqueName = 'Name' + now.getTime();
var resourceName = 'Pic' + now.getTime();

module.exports = function(sessionParam,cb) {
    session = sessionParam;
    console.log('Starting test');
    deleteAll("Contact",function(err) {
        exitOnErr(err);
        deleteAll("Document",function(err) {
            exitOnErr(err);
            upload1();
        });
    });
}

function exitOnErr(err) {
    if(err) {
        console.log(err);
        process.exit(1);
    }    
}

function deleteAll(type,cb) {
    session.directive({
        op: "SELECT", 
        targetType: type, 
        properties: ["id"]
    },function(err,result) {
        if(result.results.length === 0) return cb();
        console.log("Existing rows in " + type);
        console.dir(result.results);
        console.log('Deleting ' + result.results.length + ' rows in ' + type);
        async.forEachSeries(result.results,function(row,cb2) {
            session.directive({
                op: "DELETE",
                targetType: type,
                where: {id: row.id}
            },cb2);
        },cb);
    });
}

function upload1() {
    console.log("Uploading resource " + uniqueName);

    resourceName = "/photos/"+uniqueName;

    var d = {assetType:'resource',"filename":"icon.gif","contentType":"image/gif","resourceName":resourceName};
    var data = fs.readFileSync(path.join(__dirname,'icon.gif'));

    d.file = {filename:d.filename, contents: data};

    session.console("updateGlobalAsset",d,function(err,result) {
        if(!err) {
            // do something if needed?
            console.log(result);
        }
        insert1(err,result);
    });
}

function insert1() {
    console.log("Inserting, name is " + uniqueName);
    session.directive({
        op:'INSERT',
        targetType: 'Contact', 
        values: {
            Name: 'Adam',
            LastName: uniqueName,
            AssistantName: resourceName
        }
    },wait1);
}


function wait1(err,res) {
    //console.dir(res);
    console.log('wait1...');
    setTimeout(select1,5000);
}

function select1(res) {
    session.directive({
        op: "SELECT", 
        targetType:"Contact", 
        properties:["id","LastName","AssistantName","Birthdate"],
        where: {LastName:uniqueName}
    },update1);
}

function update1(err,res) {
    if(res && res.results && res.results[0] && res.results[0].id) {
        var id = res.results[0].id;
        session.directive({
            op:'UPDATE',
            targetType: 'Contact', 
            values: {
                AssistantName: resourceName,
            },
            where : {id: id}
        },wait2);
    } else {
        console.dir(res);
        console.log("\nres.results[0].id is not present!");
        console.log("TEST FAILED!");
        process.exit(1);
    }

}

function wait2(err,res) {
    //console.dir(res);
    console.log('wait2...');
    setTimeout(select2,2000);
}

function select2(err,res) {
    //console.log('downloading ' + uniqueName);
    session.directive({
        op: "SELECT", 
        targetType:"Contact", 
        properties:["id","LastName","AssistantName","Birthdate"],
        where: {LastName:uniqueName}
    },wait3);
}

function wait3(err,res) {
    if(res.results.length != 1) {
        console.dir(res);
        console.log("TEST FAILED!");
        process.exit(1);
    }
    console.dir(res);
    console.log('wait3...');
    setTimeout(select3,2000);
}

function select3(err,res) {
    session.directive({
        op: "SELECT", 
        targetType:"Document", 
        properties:["id","Name","ContentType","Body"]
    },done);
}

function done(err,res) {
    if(res && res.results && res.results[0] && res.results[0].Name === uniqueName) {
        console.log("TEST PASSED!");
        process.exit(0);
    } else {
        console.dir(res);
        console.log("\nres.results[0].Name != " + uniqueName);
        console.log("TEST FAILED!");
        process.exit(1);
    }
}



