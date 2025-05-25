import { checkUserChallenge } from "./userChallenge";
import { pubClient } from "../lib/redisClients";

jest.mock("../lib/redisClients", () => ({
  pubClient: {
    get: jest.fn(),
  },
}));

describe("checkUserChallenge", () => {
  it("should throw an error if the challenge is invalid", async () => {
    (pubClient.get as jest.Mock).mockResolvedValue("good_secret");

    try {
      await checkUserChallenge({ userId: "", challenge: "bad_secret" });
    } catch (e) {
      expect(String(e)).toBe("Error: Unauthorized");
    }
  });
});
