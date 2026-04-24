// Listens on channel 7 for control commands. Owner-only; ignores
// chat from other speakers. Demonstrates llListen + filter, and
// state machine triggered by chat.

integer CHANNEL = 7;
integer listening = TRUE;

default
{
    state_entry()
    {
        llListen(CHANNEL, "", llGetOwner(), "");
    }

    listen(integer channel, string name, key id, string message)
    {
        if (!listening) return;

        if (message == "on") {
            llOwnerSay("Lights: ON");
        } else if (message == "off") {
            llOwnerSay("Lights: OFF");
        } else if (message == "stop") {
            listening = FALSE;
            llOwnerSay("Listening disabled.");
        } else {
            llOwnerSay("Unknown command: " + message);
        }
    }
}
