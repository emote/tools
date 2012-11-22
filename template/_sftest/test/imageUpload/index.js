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
    console.log('waiting...');
    setTimeout(select1,3000);
}

function select1(res) {
    session.directive({
        op: "SELECT", 
        targetType:"Contact", 
        properties:["id","LastName","AssistantName","Birthdate"],
        where: {Name:uniqueName}
    },update1);
}

function update1(err,res) {
    //console.dir(res);
    var id = res.results[0].id;
    // console.log('Updating Media field of row with id='+id);

    session.directive({
        op:'UPDATE',
        targetType: 'Contact', 
        values: {
            AssistantName: resourceName,
        },
        where : {id: id}
    },wait2);
}

function wait2(err,res) {
    //console.dir(res);
    console.log('waiting...');
    setTimeout(select2,2000);
}

function select2(err,res) {
    //console.log('downloading ' + uniqueName);
    session.directive({
        op: "SELECT", 
        targetType:"Contact", 
        properties:["id","LastName","AssistantName","Birthdate"],
        where: {Name:uniqueName}
    },select3);
}

function select3(err,res) {
    if(res.results.length != 1) {
        console.dir(res);
        console.log("TEST FAILED!");
        process.exit(1);
    }
    session.directive({
        op: "SELECT", 
        targetType:"Document", 
        properties:["id","Name","ContentType","Body"]
    },done);
}

function done(err,res) {
    var selectedName = res.results[0].Name;
    if(selectedName === uniqueName) {
        console.log("TEST PASSED!");
        process.exit(0);
    } else {
        console.log(selectedName + " != " + uniqueName);
        console.log("TEST FAILED!");
        process.exit(1);
    }
}



