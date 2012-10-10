echo "starting test"
call emote create myproj --template usgs
cd myproj
call emote deploy
call emote test
