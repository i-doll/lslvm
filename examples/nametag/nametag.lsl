// Updates the prim's floating text to show the toucher's display name.
// Demonstrates llRequestAgentData + dataserver flow.

key pendingQuery = NULL_KEY;

default
{
    state_entry()
    {
        llSetText("(idle)", <1, 1, 1>, 1.0);
    }

    touch_start(integer num)
    {
        key avatar = llDetectedKey(0);
        pendingQuery = llRequestAgentData(avatar, DATA_NAME);
    }

    dataserver(key queryid, string data)
    {
        if (queryid != pendingQuery) return;
        pendingQuery = NULL_KEY;
        llSetText(data, <1, 1, 0>, 1.0);
    }
}
