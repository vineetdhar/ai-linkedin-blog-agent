# get_linkedin_token.py
# This amazing script handles the FULL OAuth flow automatically:
# 1. Opens your browser to LinkedIn login
# 2. Catches the callback code instantly
# 3. Exchanges it for an access token immediately
#
# Usage: python get_linkedin_token.py

import urllib.request
import urllib.parse
import urllib.error
import json
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

# ── Fill these in ─────────────────────────────────────────────
CLIENT_ID     = "YOUR_CLIENT_ID"
CLIENT_SECRET = "YOUR_CLIENT_SECRET="
REDIRECT_URI  = "http://localhost:8000/callback"
# ──────────────────────────────────────────────────────────────

auth_code = None

class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if "code" in params:
            auth_code = params["code"][0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Got it! You can close this tab and go back to your terminal.")
            print(f"\n✅ Code received!")
        elif "error" in params:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(f"Error: {params.get('error_description', ['unknown'])[0]}".encode())
            print(f"\n❌ Auth error: {params}")

    def log_message(self, format, *args):
        pass  # suppress server logs

def exchange_code(code):
    data = urllib.parse.urlencode({
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  REDIRECT_URI,
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://www.linkedin.com/oauth/v2/accessToken",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())

# Start local server
server = HTTPServer(("localhost", 8000), CallbackHandler)
server_thread = threading.Thread(target=server.handle_request)
server_thread.daemon = True
server_thread.start()

# Open browser to LinkedIn auth page
auth_url = (
    f"https://www.linkedin.com/oauth/v2/authorization"
    f"?response_type=code"
    f"&client_id={CLIENT_ID}"
    f"&redirect_uri={urllib.parse.quote(REDIRECT_URI, safe='')}"
    f"&scope=w_member_social%20openid%20profile%20email"
)

print("🌐 Opening LinkedIn in your browser...")
print("   Log in and approve the app when prompted.\n")
webbrowser.open(auth_url)

# Wait for the callback
server_thread.join(timeout=120)

if not auth_code:
    print("❌ Timed out waiting for LinkedIn callback. Try again.")
else:
    print("🔄 Exchanging code for access token...")
    result = exchange_code(auth_code)

    if "access_token" in result:
        print("\n✅ Success! Here is your access token:\n")
        print(f"LINKEDIN_ACCESS_TOKEN={result['access_token']}")
        print(f"\nExpires in: {result.get('expires_in', 'unknown')} seconds (~60 days)")
        print("\nAdd that line to your .env file and you are all set!")

        # Save to file automatically
        with open("linkedin_token.txt", "w") as f:
            f.write(f"LINKEDIN_ACCESS_TOKEN={result['access_token']}\n")
        print("✅ Also saved to linkedin_token.txt in your project folder.")
    else:
        print(f"\n❌ Error: {result}")
