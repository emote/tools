echo "starting test"
call emote create myproj
cd myproj
call emote add all usgs --template _usgstest
call emote build
call emote deploy --profile ../profile.json
call emote test --profile ../profile.json
cd ..
call emote create sfproj
cd sfproj
call emote add all sfdc --template _sftest
call emote build
call emote deploy --profile ../profile.json
call emote test --profile ../profile.json

