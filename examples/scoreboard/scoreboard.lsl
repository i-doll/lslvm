// Linkset Data demo: a tiny scoreboard.
//
// Anyone can shout "score <name>" on channel 0 to bump that name's
// score; "show" prints the leaderboard; "reset" wipes it. Scores
// survive llResetScript because Linkset Data lives on the linkset,
// not the script.

integer total = 0;

show()
{
    list keys = llLinksetDataFindKeys("^score:", 0, -1);
    integer n = llGetListLength(keys);
    if (n == 0) {
        llSay(0, "no scores yet");
        return;
    }
    integer i = 0;
    for (i = 0; i < n; i = i + 1) {
        string k = llList2String(keys, i);
        string name = llGetSubString(k, 6, -1);
        llSay(0, name + ": " + llLinksetDataRead(k));
    }
}

default
{
    state_entry()
    {
        llListen(0, "", NULL_KEY, "");
        // total persists across llResetScript via LSD.
        total = (integer)llLinksetDataRead("meta:total");
    }

    listen(integer channel, string name, key id, string message)
    {
        list parts = llParseString2List(message, [" "], []);
        string cmd = llList2String(parts, 0);

        if (cmd == "score") {
            string who = llList2String(parts, 1);
            if (who == "") return;
            string slot = "score:" + who;
            integer current = (integer)llLinksetDataRead(slot);
            llLinksetDataWrite(slot, (string)(current + 1));
            total = total + 1;
            llLinksetDataWrite("meta:total", (string)total);
        }
        else if (cmd == "show") {
            show();
            llSay(0, "total: " + (string)total);
        }
        else if (cmd == "reset") {
            llLinksetDataReset();
            total = 0;
        }
    }

    linkset_data(integer action, string keyname, string value)
    {
        if (action == LINKSETDATA_RESET) {
            llSay(0, "scoreboard cleared");
        }
    }
}
