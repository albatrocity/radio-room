import { describe, test, afterEach } from "@jest/globals";
import { TriggerEvent, WithTriggerMeta } from "../types/Triggers";
import { processTrigger } from "./processTriggerAction";
import { Reaction, ReactionPayload } from "../types/Reaction";
import performTriggerAction from "./performTriggerAction";
import { makeSocket } from "../lib/testHelpers";

jest.mock("./performTriggerAction");

const { io } = makeSocket();

function stubTrigger({
  on = "reaction",
  subject = {
    type: "track",
    id: "latest",
  },
  action = "skipTrack",
  conditions = {
    compareTo: "listeners",
    comparator: ">",
    threshold: 2,
    thresholdType: "count",
    qualifier: {
      sourceAttribute: "emoji",
      determiner: ":-1:",
      comparator: "includes",
    },
  },
}: Partial<TriggerEvent<Reaction>>) {
  return {
    on,
    subject,
    action,
    conditions,
  };
}

function stubReaction({
  emoji = thumbsDownEmoji,
  user = homer,
  reactTo = {
    type: "track" as const,
    id: "track1",
  },
  meta = {
    sourcesOnSubject: [],
  },
}: Partial<WithTriggerMeta<ReactionPayload, Reaction>>): WithTriggerMeta<
  ReactionPayload,
  Reaction
> {
  return {
    emoji,
    reactTo,
    user,
    meta,
  };
}

const homer = {
  username: "Homer",
  userId: "1",
};
const marge = {
  username: "Marge",
  userId: "2",
};
const lisa = {
  username: "Lisa",
  userId: "3",
};
const bart = {
  username: "Bart",
  userId: "4",
};
const maggie = {
  username: "Maggie",
  userId: "5",
};

const thumbsDownEmoji = {
  name: "thumbs_down",
  shortcodes: ":-1:",
  id: "thumbs_down",
  keywords: [],
  skins: [],
  version: 1,
};

afterEach(() => {
  jest.resetAllMocks();
});

describe.skip("processReactionTrigger", () => {
  describe("determined on main resource", () => {
    describe("count", () => {
      describe("<", () => {
        const trigger = stubTrigger({
          conditions: {
            comparator: "<",
            threshold: 2,
            thresholdType: "count",
            qualifier: {
              sourceAttribute: "emoji",
              comparator: "includes",
              determiner: ":-1:",
            },
          },
        });
        test("skips when threshold is not met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: marge.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).not.toHaveBeenCalled();
        });

        test("calls when threshold is met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [{ emoji: ":-1:", user: marge.userId }],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).toHaveBeenCalled();
        });
      });

      describe("<=", () => {
        const trigger = stubTrigger({
          conditions: {
            comparator: "<=",
            threshold: 2,
            thresholdType: "count",
            qualifier: {
              sourceAttribute: "emoji",
              comparator: "includes",
              determiner: ":-1:",
            },
          },
        });
        test("skips when threshold is not met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: lisa.userId },
                { emoji: ":-1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).not.toHaveBeenCalled();
        });

        test("calls when threshold is met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).toHaveBeenCalled();
        });
      });

      describe("=", () => {
        const trigger = stubTrigger({
          conditions: {
            comparator: "=",
            threshold: 2,
            thresholdType: "count",
            qualifier: {
              sourceAttribute: "emoji",
              comparator: "includes",
              determiner: ":-1:",
            },
          },
        });
        test("skips when threshold is not met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: lisa.userId },
                { emoji: ":-1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).not.toHaveBeenCalled();
        });

        test("calls when threshold is met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).toHaveBeenCalled();
        });
      });

      describe(">", () => {
        const trigger = stubTrigger({
          conditions: {
            comparator: ">",
            threshold: 2,
            thresholdType: "count",
            qualifier: {
              sourceAttribute: "emoji",
              comparator: "includes",
              determiner: ":-1:",
            },
          },
        });
        test("skips when threshold is not met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [{ emoji: ":-1:", user: marge.userId }],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).not.toHaveBeenCalled();
        });

        test("calls when threshold is met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: lisa.userId },
                { emoji: ":-1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).toHaveBeenCalled();
        });
      });

      describe(">=", () => {
        const trigger = stubTrigger({
          conditions: {
            comparator: ">=",
            threshold: 2,
            thresholdType: "count",
            qualifier: {
              sourceAttribute: "emoji",
              comparator: "includes",
              determiner: ":-1:",
            },
          },
        });
        test("skips when threshold is not met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [{ emoji: ":-1:", user: marge.userId }],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).not.toHaveBeenCalled();
        });

        test("calls when threshold is met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: lisa.userId },
                { emoji: ":-1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).toHaveBeenCalled();
        });
      });
    });
    describe("percent", () => {
      describe("<", () => {
        const trigger = stubTrigger({
          conditions: {
            comparator: "<",
            threshold: 50,
            thresholdType: "percent",
            qualifier: {
              sourceAttribute: "emoji",
              comparator: "includes",
              determiner: ":-1:",
            },
          },
        });
        test("skips when threshold is not met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":+1:", user: marge.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).not.toHaveBeenCalled();
        });

        test("calls when threshold is met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":+1:", user: marge.userId },
                { emoji: ":+1:", user: marge.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).toHaveBeenCalled();
        });
      });

      describe("<=", () => {
        const trigger = stubTrigger({
          conditions: {
            comparator: "<=",
            threshold: 50,
            thresholdType: "percent",
            qualifier: {
              sourceAttribute: "emoji",
              comparator: "includes",
              determiner: ":-1:",
            },
          },
        });
        test("skips when threshold is not met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: lisa.userId },
                { emoji: ":-1:", user: maggie.userId },
                { emoji: ":+1:", user: bart.userId },
                { emoji: ":+1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).not.toHaveBeenCalled();
        });

        test("calls when threshold is met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: lisa.userId },
                { emoji: ":+1:", user: bart.userId },
                { emoji: ":+1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).toHaveBeenCalled();
        });
      });

      describe("=", () => {
        const trigger = stubTrigger({
          conditions: {
            comparator: "=",
            threshold: 50,
            thresholdType: "percent",
            qualifier: {
              sourceAttribute: "emoji",
              comparator: "includes",
              determiner: ":-1:",
            },
          },
        });
        test("skips when threshold is not met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: lisa.userId },
                { emoji: ":-1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).not.toHaveBeenCalled();
        });

        test("calls when threshold is met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":+1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).toHaveBeenCalled();
        });
      });

      describe(">", () => {
        const trigger = stubTrigger({
          conditions: {
            comparator: ">",
            threshold: 50,
            thresholdType: "percent",
            qualifier: {
              sourceAttribute: "emoji",
              comparator: "includes",
              determiner: ":-1:",
            },
          },
        });
        test("skips when threshold is not met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":+1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).not.toHaveBeenCalled();
        });

        test("calls when threshold is met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":+1:", user: maggie.userId },
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: lisa.userId },
                { emoji: ":-1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).toHaveBeenCalled();
        });
      });

      describe(">=", () => {
        const trigger = stubTrigger({
          conditions: {
            comparator: ">=",
            threshold: 50,
            thresholdType: "percent",
            qualifier: {
              sourceAttribute: "emoji",
              comparator: "includes",
              determiner: ":-1:",
            },
          },
        });
        test("skips when threshold is not met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":+1:", user: bart.userId },
                { emoji: ":+1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).not.toHaveBeenCalled();
        });

        test("calls when threshold is met", () => {
          const reaction = stubReaction({
            meta: {
              sourcesOnSubject: [
                { emoji: ":-1:", user: marge.userId },
                { emoji: ":-1:", user: bart.userId },
                { emoji: ":+1:", user: homer.userId },
              ],
            },
          });

          processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

          expect(performTriggerAction).toHaveBeenCalled();
        });
      });
    });
  });

  describe("compareTo", () => {
    const trigger = stubTrigger({
      conditions: {
        compareTo: "listeners",
        comparator: ">",
        threshold: 50,
        thresholdType: "percent",
        qualifier: {
          sourceAttribute: "emoji",
          comparator: "includes",
          determiner: ":-1:",
        },
      },
    });
    test("skips when threshold is not met", () => {
      const reaction = stubReaction({
        meta: {
          sourcesOnSubject: [
            { emoji: ":+1:", user: marge.userId },
            { emoji: ":+1:", user: homer.userId },
            { emoji: ":-1:", user: maggie.userId },
          ],
          compareTo: {
            listeners: [marge, homer, lisa],
          },
        },
      });

      processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

      expect(performTriggerAction).not.toHaveBeenCalled();
    });

    test("calls when threshold is met", () => {
      const reaction = stubReaction({
        meta: {
          sourcesOnSubject: [
            { emoji: ":-1:", user: marge.userId },
            { emoji: ":-1:", user: homer.userId },
          ],
          compareTo: {
            listeners: [marge, homer],
          },
        },
      });

      processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

      expect(performTriggerAction).toHaveBeenCalled();
    });

    test("reads from the correct compareTo", () => {
      const reaction = stubReaction({
        meta: {
          sourcesOnSubject: [
            { emoji: ":-1:", user: marge.userId },
            { emoji: ":-1:", user: homer.userId },
          ],
          compareTo: {
            listeners: [marge, homer],
            users: [marge, homer, lisa, bart, maggie],
          },
        },
      });

      const trigger = stubTrigger({
        conditions: {
          compareTo: "users",
          comparator: ">",
          threshold: 50,
          thresholdType: "percent",
          qualifier: {
            sourceAttribute: "emoji",
            comparator: "includes",
            determiner: ":-1:",
          },
        },
      });

      processTrigger<ReactionPayload, Reaction>(reaction, trigger, io);

      expect(performTriggerAction).not.toHaveBeenCalled();
    });
  });
});
