import axios from "axios";
import QueryString from "qs";
import qs from "qs";

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

export type SpotifyAuthTokenResponse = {
  access_token: string
  token_type: string
  scope: string
  expires_in: number
  refresh_token: string
}

export default async function getSpotifyAuthTokens(
  code: string | QueryString.ParsedQs | string[] | QueryString.ParsedQs[] | null
): Promise<SpotifyAuthTokenResponse> {
  const { data } = await axios({
    method: "POST",
    url: "https://accounts.spotify.com/api/token",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(client_id + ":" + client_secret).toString("base64"),
    },
    data: qs.stringify({
      code: code,
      redirect_uri: redirect_uri,
      grant_type: "authorization_code",
    }),
  });

  return data as SpotifyAuthTokenResponse;
}
