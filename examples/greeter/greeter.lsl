// Greets the avatar who touches the prim. If nobody touches again
// within 60 seconds, says a follow-up reminder. Multi-state to show
// the typical "active vs idle" pattern.

key lastToucher = NULL_KEY;
string lastName = "";

default
{
    state_entry()
    {
        llSetTimerEvent(0);
    }

    touch_start(integer num)
    {
        lastToucher = llDetectedKey(0);
        lastName = llDetectedName(0);
        llSay(0, "Hello, " + lastName + "!");
        state waiting;
    }
}

state waiting
{
    state_entry()
    {
        llSetTimerEvent(60.0);
    }

    state_exit()
    {
        llSetTimerEvent(0);
    }

    timer()
    {
        llSay(0, "Anyone there?");
        state default;
    }

    touch_start(integer num)
    {
        lastToucher = llDetectedKey(0);
        lastName = llDetectedName(0);
        llSay(0, "Hello again, " + lastName + "!");
        // Reset the timer by re-entering this state.
        llSetTimerEvent(60.0);
    }
}
