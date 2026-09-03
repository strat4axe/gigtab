import { assertEquals, assertExists } from "jsr:@std/assert@^1.0.17";
import { suggestYoutubeVideo } from "./youtube_suggest.ts";

const originalFetch = globalThis.fetch;

const mockHtml = `
<!DOCTYPE html>
<html>
<head>
<script>
var ytInitialData = {
  "contents": {
    "twoColumnSearchResultsRenderer": {
      "primaryContents": {
        "sectionListRenderer": {
          "contents": [
            {
              "itemSectionRenderer": {
                "contents": [
                  {
                    "videoRenderer": {
                      "videoId": "vid-oac",
                      "title": {
                        "runs": [
                          { "text": "Maren Morris - The Bones (Official Video)" }
                        ]
                      },
                      "ownerText": {
                        "runs": [
                          {
                            "text": "MarenMorrisVEVO",
                            "navigationEndpoint": {
                              "browseEndpoint": {
                                "browseId": "UC-oac"
                              }
                            }
                          }
                        ]
                      },
                      "lengthText": { "simpleText": "3:45" },
                      "thumbnail": {
                        "thumbnails": [
                          { "url": "https://img.yt/1" }
                        ]
                      },
                      "ownerBadges": [
                        {
                          "metadataBadgeRenderer": {
                            "style": "BADGE_STYLE_TYPE_VERIFIED_ARTIST"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "videoRenderer": {
                      "videoId": "vid-topic",
                      "title": {
                        "runs": [
                          { "text": "The Bones" }
                        ]
                      },
                      "ownerText": {
                        "runs": [
                          {
                            "text": "Maren Morris - Topic",
                            "navigationEndpoint": {
                              "browseEndpoint": {
                                "browseId": "UC-topic"
                              }
                            }
                          }
                        ]
                      },
                      "lengthText": { "simpleText": "3:45" },
                      "thumbnail": {
                        "thumbnails": [
                          { "url": "https://img.yt/2" }
                        ]
                      }
                    }
                  },
                  {
                    "videoRenderer": {
                      "videoId": "vid-cover",
                      "title": {
                        "runs": [
                          { "text": "The Bones - Maren Morris (Guitar Cover)" }
                        ]
                      },
                      "ownerText": {
                        "runs": [
                          {
                            "text": "GuitarGuy123",
                            "navigationEndpoint": {
                              "browseEndpoint": {
                                "browseId": "UC-guy"
                              }
                            }
                          }
                        ]
                      },
                      "lengthText": { "simpleText": "4:00" },
                      "thumbnail": {
                        "thumbnails": [
                          { "url": "https://img.yt/3" }
                        ]
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    }
  }
};
</script>
</head>
<body></body>
</html>
`;

Deno.test({
    name: "suggestYoutubeVideo - parses and scores suggestions correctly",
    async fn() {
        // Mock fetch
        globalThis.fetch = () => {
            return Promise.resolve(
                new Response(mockHtml, {
                    status: 200,
                    statusText: "OK",
                }),
            );
        };

        try {
            const results = await suggestYoutubeVideo("Maren Morris", "The Bones");

            assertExists(results);
            assertEquals(results.length, 3);

            // The official video (vid-oac) should be sorted first due to its high score
            assertEquals(results[0].videoID, "vid-oac");
            assertEquals(results[0].title, "Maren Morris - The Bones (Official Video)");
            assertEquals(results[0].channelTitle, "MarenMorrisVEVO");
            assertEquals(results[0].isOfficial, true);
            assertEquals(results[0].duration, "3:45");

            // The topic video (vid-topic) should be second
            assertEquals(results[1].videoID, "vid-topic");
            assertEquals(results[1].isOfficial, true); // from " - Topic" channel suffix

            // The cover video (vid-cover) should be third and have a low score
            assertEquals(results[2].videoID, "vid-cover");
            assertEquals(results[2].isOfficial, false);
            // Verify cover video gets demoted
            assertEquals(results[2].score < results[0].score, true);
        } finally {
            // Restore fetch
            globalThis.fetch = originalFetch;
        }
    },
});
