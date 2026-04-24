// Fetches a URL when touched. Reports the result via owner chat.
// Demonstrates llHTTPRequest + http_response handling with status checks.

key pendingRequest = NULL_KEY;

default
{
    touch_start(integer num)
    {
        pendingRequest = llHTTPRequest(
            "https://api.example.test/status",
            [HTTP_METHOD, "GET"],
            ""
        );
        llOwnerSay("Fetching status...");
    }

    http_response(key request_id, integer status, list metadata, string body)
    {
        if (request_id != pendingRequest) return;
        pendingRequest = NULL_KEY;

        if (status == 200) {
            llOwnerSay("OK: " + body);
        } else {
            llOwnerSay("Error " + (string)status);
        }
    }
}
