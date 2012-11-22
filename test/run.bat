echo "starting test"
call emote create myproj --template usgs
cd myproj
call emote deploy --profile ../profile.json
call emote test --profile ../profile.json
cd ..
call emote create sfproj --template _sftest
cd sfproj
call emote deploy --profile ../profile.json
call emote test --profile ../profile.json

