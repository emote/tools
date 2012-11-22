echo "starting test"
emote create myproj --template usgs
cd myproj
emote deploy --profile ../profile.json
emote test --profile ../profile.json
cd ..
emote create sfproj --template _sftest
cd sfproj
emote deploy --profile ../profile.json
emote test --profile ../profile.json
