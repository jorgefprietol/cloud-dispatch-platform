#!/bin/sh
set -eu
jq -n --arg authMode "$AUTH_MODE" --arg authority "$OIDC_AUTHORITY" --arg clientId "$OIDC_CLIENT_ID" --arg redirectUri "$OIDC_REDIRECT_URI" --arg logoutUrl "${OIDC_LOGOUT_URL:-}" '{authMode:$authMode,authority:$authority,clientId:$clientId,redirectUri:$redirectUri,logoutUrl:$logoutUrl}' > /usr/share/nginx/html/config.json
