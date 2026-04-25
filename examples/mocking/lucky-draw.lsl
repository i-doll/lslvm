// Lucky-draw: on touch, look up the toucher's name, roll a d100, announce
// the result, and hand out a prize on a high roll. Used by the test file
// next to it to demonstrate three patterns of `script.mock(...)`.

string PRIZE_ITEM = "Lucky Coin";

default
{
    touch_start(integer num)
    {
        key toucher = llDetectedKey(0);
        string name = llKey2Name(toucher);
        integer roll = llFloor(llFrand(100.0));

        llSay(0, "Welcome " + name + "! You rolled " + (string)roll + ".");

        if (roll >= 90) {
            llSay(0, "Lucky! Have a " + PRIZE_ITEM + ".");
            llGiveInventory(toucher, PRIZE_ITEM);
        }
    }
}
