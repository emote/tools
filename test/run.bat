echo "starting test"
call emote create myproj
cd myproj
call emote add usgs
call emote build
call emote deploy --profile ../profile.json
call emote test --profile ../profile.json
cd ..
call emote create sfproj
cd sfproj
call emote add _sftest
call emote build
call emote deploy --profile ../profile.json
call emote test --profile ../profile.json

