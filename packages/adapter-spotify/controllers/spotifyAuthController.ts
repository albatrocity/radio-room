import querystring from "querystring";

import { Request, Response } from "express";
import generateRandomString from "../lib/generateRandomString";
import getSpotifyAuthTokens from "../operations/spotify/getSpotifyAuthTokens";
import storeUserSpotifyTokens from "../operations/spotify/storeUserSpotifyTokens";
import { makeSpotifyApi } from "../lib/spotifyApi";
import { saveUser, removeUserRoomsSpotifyError } from "../operations/data";
import { first } from "remeda";

const client_id = process.env.CLIENT_ID; // Your client id
const redirect_uri = process.env.REDIRECT_URI; // Your redirect uri

const stateKey = "spotify_auth_state";
const userIdKey = "spotify_auth_user_id";
const redirectKey = "after_spotify_auth_redirect";

type ReqQuery = {
  userId?: string;
  roomTitle?: string;
  redirect?: string;
};

export async function login(
  req: Request<any, any, any, ReqQuery>,
  res: Response
) {
  const state = generateRandomString(16);
  // get userId from query params
  const userId = req.query.userId;
  const roomTitle = req.query.roomTitle;

  res.cookie(stateKey, state);
  if (userId) {
    res.cookie(userIdKey, userId);
  }
  res.cookie(redirectKey, req.query.redirect);

  const scope =
    "user-read-private user-read-email playlist-modify-public user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-library-modify";

  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      querystring.stringify({
        response_type: "code",
        client_id: client_id,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state,
        roomTitle: roomTitle,
      })
  );
}

export async function callback(req: Request, res: Response) {
  const code = req.query.code ?? null;
  const state = req.query.state ?? null;

  const storedState = req.cookies ? req.cookies[stateKey] : null;
  const redirect = req.cookies ? req.cookies[redirectKey] : null;

  if (state === null || state !== storedState || !code) {
    res.redirect(
      "/#" +
        querystring.stringify({
          error: "state_mismatch",
        })
    );
  } else {
    res.clearCookie(stateKey);

    try {
      const { access_token, refresh_token } = await getSpotifyAuthTokens(code);

      const spotify = makeSpotifyApi({
        accessToken: access_token,
        refreshToken: refresh_token,
      });
      const me = await spotify.getMe();
      const userId = me.body.id;
      const username = req.session.user?.username ?? me.body.display_name;

      req.session.user = { userId, username };

      const challenge = generateRandomString(16);

      const userAttributes = {
        userId,
        username,
        isAdmin: true,
      };

      // save user to Redis
      await saveUser(userId, userAttributes);
      await storeUserSpotifyTokens({
        access_token,
        refresh_token,
        userId: userId,
        challenge,
      });

      await removeUserRoomsSpotifyError(userId);

      if (process.env.APP_URL) {
        const params = {
          toast: "Spotify authentication successful",
          userId,
          challenge,
        };

        res.redirect(
          `${process.env.APP_URL}${redirect ?? ""}?${querystring.stringify(
            params
          )}`
        );
      } else {
        res.send({ access_token });
      }
    } catch (e) {
      console.log(e);
      res.send({
        error: e,
      });
    }
  }
}
