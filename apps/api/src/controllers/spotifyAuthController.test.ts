import { callback, login } from "./spotifyAuthController";
import * as httpMocks from "node-mocks-http";
import getSpotifyAuthTokens from "../operations/spotify/getSpotifyAuthTokens";
import storeUserSpotifyTokens from "../operations/spotify/storeUserSpotifyTokens";
import { Request } from "express";

jest.mock("../operations/spotify/getSpotifyAuthTokens");
jest.mock("../operations/data");
jest.mock("../lib/generateRandomString", () => () => "RANDOM_STRING");
jest.mock("../operations/spotify/storeUserSpotifyTokens", () => jest.fn());
jest.mock("../lib/spotifyApi", () => ({
  makeSpotifyApi: jest.fn(() => ({
    getMe: jest.fn(() => ({
      body: {
        id: "1234",
        display_name: "Homer Simpson",
      },
    })),
  })),
}));

const OLD_ENV = process.env;
beforeEach(() => {
  jest.resetModules(); // Most important - it clears the cache
  process.env = { ...OLD_ENV }; // Make a copy
  (getSpotifyAuthTokens as jest.Mock).mockResolvedValueOnce({
    access_token: "access_token",
    refresh_token: "refresh_token",
  });
});

afterAll(() => {
  process.env = OLD_ENV; // Restore old environment
});

type TestRequest = Request<
  any,
  any,
  any,
  any,
  {
    session: {
      save: () => Promise<void>;
      user: {};
    };
  }
>;

describe("login", () => {
  it("redirects to spotify login", async () => {
    const request = httpMocks.createRequest<TestRequest>({
      method: "GET",
      url: "/login",
      session: {
        user: {},
      },
    });

    const response = httpMocks.createResponse();

    await login(request, response);

    expect(response._getRedirectUrl()).toBe(
      `https://accounts.spotify.com/authorize?response_type=code&client_id=&scope=user-read-private%20user-read-email%20playlist-read-collaborative%20playlist-modify-private%20playlist-modify-public%20user-read-playback-state%20user-modify-playback-state%20user-read-currently-playing%20user-library-read%20user-library-modify&redirect_uri=&state=RANDOM_STRING&roomTitle=`
    );
  });
});

describe("callback", () => {
  it("redirects on state mismatch", async () => {
    const request = httpMocks.createRequest<TestRequest>({
      method: "GET",
      url: "/callback",
      query: {
        userId: 1234,
        state: "NEW_STATE",
      },
      cookies: {
        spotify_auth_state: "OLD_STATE",
      },
      session: {
        user: {},
      },
    });
    const response = httpMocks.createResponse();

    await callback(request, response);
    expect(response._getRedirectUrl()).toBe("/#error=state_mismatch");
  });

  it("gets token from Spotify", async () => {
    const request = httpMocks.createRequest<TestRequest>({
      method: "GET",
      url: "/callback",
      query: {
        userId: 1234,
        state: "STATE",
        code: "SECRET_CODE",
      },
      cookies: {
        spotify_auth_state: "STATE",
      },
      session: {
        user: {},
      },
    });
    const response = httpMocks.createResponse();

    await callback(request, response);

    expect(getSpotifyAuthTokens).toHaveBeenCalledWith("SECRET_CODE");
  });

  it("updates Redis with tokens for guests", async () => {
    const request = httpMocks.createRequest<TestRequest>({
      method: "GET",
      url: "/callback",
      query: {
        userId: "1234",
        state: "STATE",
        code: "SECRET_CODE",
      },
      cookies: {
        spotify_auth_state: "STATE",
      },
      session: {
        user: {},
      },
    });
    const response = httpMocks.createResponse();

    (getSpotifyAuthTokens as jest.Mock).mockResolvedValueOnce({
      access_token: "access_token",
      refresh_token: "refresh_token",
    });

    await callback(request, response);

    expect(storeUserSpotifyTokens).toHaveBeenCalledWith({
      access_token: "access_token",
      refresh_token: "refresh_token",
      challenge: "RANDOM_STRING",
      userId: "1234",
    });
  });

  it("redirects to APP_URL after auth", async () => {
    process.env.APP_URL = "https://www.listeningroom.club";

    const request = httpMocks.createRequest<TestRequest>({
      method: "GET",
      url: "/callback",
      query: {
        userId: 1234,
        state: "RANDOM_STRING",
        code: "SECRET_CODE",
      },
      cookies: {
        spotify_auth_state: "RANDOM_STRING",
      },
      session: {
        user: {},
      },
    });
    const response = httpMocks.createResponse();

    (getSpotifyAuthTokens as jest.Mock).mockResolvedValueOnce({
      access_token: "access_token",
      refresh_token: "refresh_token",
    });

    await callback(request, response);
    expect(response._getRedirectUrl()).toBe(
      "https://www.listeningroom.club?toast=Spotify%20authentication%20successful&userId=1234&challenge=RANDOM_STRING"
    );
  });

  it("sets session user", async () => {
    process.env.APP_URL = "https://www.listeningroom.club";

    const request = httpMocks.createRequest<TestRequest>({
      method: "GET",
      url: "/callback",
      query: {
        userId: 1234,
        state: "RANDOM_STRING",
        code: "SECRET_CODE",
      },
      cookies: {
        spotify_auth_state: "RANDOM_STRING",
      },
      session: {
        user: {},
      },
    });
    const response = httpMocks.createResponse();

    (getSpotifyAuthTokens as jest.Mock).mockResolvedValueOnce({
      access_token: "access_token",
      refresh_token: "refresh_token",
    });

    await callback(request, response);
    expect(request.session.user).toEqual({
      userId: "1234",
      username: "Homer Simpson",
    });
  });
});
