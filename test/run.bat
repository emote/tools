echo "starting test"
call emote create myproj --template usgs
cd myproj
call emote deploy --profile ../profile.json
call emote test --profile ../profile.json
