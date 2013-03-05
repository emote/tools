var exec = require('child_process').exec
var fs = require("fs");
var path = require("path");

var helpTopics = {
    // help by topic is not yet implmented in emote
};

exports.command = function(param,callback) {
    var topic;
    var fn;

    if(param) {
        topic = helpTopics[param];
        if(!topic) {
            console.log("No help available for " + param);
            process.exit(1);
        }
        fn = path.join(__dirname,"..","doc",topic+".md");
    } else {
        fn = path.join(__dirname,"..","README.md");
    }

    var text = fs.readFileSync(fn,"utf8");
    console.log(text);

    callback();
}