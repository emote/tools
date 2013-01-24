"use strict";

var fs = require('fs');
var path = require('path');

var dir = path.normalize(__dirname + path.sep + "..");
if (dir.indexOf('\\') >= 0) {
    var pwdarr = dir.split('\\');
    pwdarr.forEach(function(row, index) {
        if (row.indexOf(' ') >= 0) {
            pwdarr[index] = row.split(" ").join("").substring(0,6) + "~1";
        }
    })
    dir = pwdarr.join('/');
}

var exportCmd =  "export EMOTE_HOME=" + dir + "\n";
var completionScript = fs.readFileSync(__dirname + path.sep + "emote-completion.template").toString().replace(/[\r]/g, '');

fs.writeFileSync(__dirname + path.sep + "emote-completion", exportCmd + completionScript);
console.log();
console.log("------------------------------------------------------------------------------");
console.log("To enable bash command completion for emote, add the line:");
console.log();
console.log("    . " + dir + "/scripts/emote-completion");
console.log();
console.log("to your bash initialization file (.profile, .bash_profile, .bash_login, etc.)");
console.log("------------------------------------------------------------------------------");
console.log();
