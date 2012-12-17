echo "starting test"
emote create myproj
cd myproj
emote add all usgs --template usgs
emote build
emote deploy --profile ../profile.json
emote test --profile ../profile.json
cd ..
emote create sfproj
cd sfproj
emote add all sfdc --template Salesforce
emote build
emote deploy --profile ../profile.json
emote test --profile ../profile.json
